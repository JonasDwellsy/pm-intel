import Anthropic from "@anthropic-ai/sdk";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { ASK_TOOLS, executeTool } from "@/lib/ask-tools";
import { buildSystemPrompt } from "@/lib/ask-system-prompt";
import { prisma } from "@/lib/prisma";
import { captureServerEvent, flushAnalyticsServer } from "@/lib/analytics-server";

// POST /api/ask — streaming Claude tool-calling endpoint.
//
// Request body: { messages: Array<{ role: "user" | "assistant", content: string }> }
// Response: SSE stream with these event types:
//   { type: "text_delta", delta: string }           // streamed assistant text
//   { type: "tool_use", tool: string, status: "running" | "complete" }
//   { type: "complete", remaining: number }         // request finished
//   { type: "error", error: string }                // recoverable error
//
// Conversation state lives client-side. The client posts the full history
// each turn; the server doesn't persist anything. Rate limiting uses a
// daily counter in the dq_ask_quota cookie.

export const runtime = "nodejs"; // Anthropic SDK + Prisma both need Node
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;
const MAX_TURNS_OF_HISTORY = 10;
const MAX_TOOL_ITERATIONS = 8; // safety net against runaway tool loops
const DAILY_QUERY_LIMIT = 25;
const QUOTA_COOKIE = "dq_ask_quota";

interface QuotaState {
  count: number;
  day: string; // YYYY-MM-DD UTC
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseQuota(raw: string | undefined): QuotaState {
  if (!raw) return { count: 0, day: todayUtc() };
  try {
    const parsed = JSON.parse(raw) as Partial<QuotaState>;
    if (typeof parsed.count !== "number" || typeof parsed.day !== "string") {
      return { count: 0, day: todayUtc() };
    }
    return parsed.day === todayUtc()
      ? { count: parsed.count, day: parsed.day }
      : { count: 0, day: todayUtc() };
  } catch {
    return { count: 0, day: todayUtc() };
  }
}

// Truncate the messages array to the last N user-or-assistant turns so
// prompts don't grow unbounded. Older turns are dropped wholesale rather
// than summarized — fast and predictable.
function trimHistory(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages.slice(-MAX_TURNS_OF_HISTORY);
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[api/ask] ANTHROPIC_API_KEY env var missing");
    return Response.json(
      { error: "Ask Dwellsy IQ is not configured." },
      { status: 500 }
    );
  }

  // Rate-limit gate. Cookie is set on the response (regardless of outcome)
  // so a 429 still updates the day if it rolled over.
  const cookieStore = await cookies();
  const quota = parseQuota(cookieStore.get(QUOTA_COOKIE)?.value);
  if (quota.count >= DAILY_QUERY_LIMIT) {
    return Response.json(
      {
        error: "Daily query limit reached. Try again tomorrow.",
        remaining: 0,
      },
      { status: 429 }
    );
  }

  let body: { messages?: unknown };
  try {
    body = (await req.json()) as { messages?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const rawMessages = body.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return Response.json(
      { error: "messages array is required." },
      { status: 400 }
    );
  }

  // Normalize + validate the message shape.
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of rawMessages) {
    if (
      m &&
      typeof m === "object" &&
      (m as { role?: string }).role &&
      typeof (m as { content?: unknown }).content === "string"
    ) {
      const role = (m as { role: string }).role;
      if (role === "user" || role === "assistant") {
        messages.push({ role, content: (m as { content: string }).content });
      }
    }
  }
  if (messages.length === 0) {
    return Response.json(
      { error: "messages must contain at least one user message." },
      { status: 400 }
    );
  }
  if (messages[messages.length - 1].role !== "user") {
    return Response.json(
      { error: "Last message must be from the user." },
      { status: 400 }
    );
  }

  // v0.17 — Capture askai_query_submitted BEFORE the stream opens.
  // We pass query_length_chars only; the raw text NEVER leaves the
  // server and is NEVER attached to the PostHog event (privacy
  // guardrail). userId is best-effort — AskAI is open to anonymous
  // visitors who passed the research-preview password gate.
  const { userId: askUserId } = await auth();
  const lastUserMessage = messages[messages.length - 1].content;
  captureServerEvent({
    userId: askUserId,
    event: "askai_query_submitted",
    properties: {
      query_length_chars: lastUserMessage.length,
      turn_index: messages.length, // 1-based; first message is turn 1
    },
  });

  // Pull dataAsOf + methodologyVersion from any PM row — every row
  // carries the same version per the seed. Cheap query (one row, two
  // columns) and also confirms Postgres reachability before we start
  // the stream.
  const seedPm = await prisma.pM.findFirst({
    select: { methodologyVersion: true, dataAsOf: true },
  });
  const systemPrompt = buildSystemPrompt({
    dataAsOf: seedPm?.dataAsOf.toISOString().slice(0, 10) ?? "2026-05-19",
    methodologyVersion: seedPm?.methodologyVersion ?? "v0.6.4",
  });

  // Increment the quota optimistically. If the model errors mid-stream
  // we leave the counter incremented — better to slightly over-count
  // than to leak free queries when generation partially failed.
  const updatedQuota: QuotaState = {
    count: quota.count + 1,
    day: todayUtc(),
  };
  cookieStore.set({
    name: QUOTA_COOKIE,
    value: JSON.stringify(updatedQuota),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7d — covers timezone wrap edges
  });
  const remainingAfter = DAILY_QUERY_LIMIT - updatedQuota.count;

  // Cast to the SDK's MessageParam shape (assistant blocks may include
  // tool_use later, but in the initial transcript they're pure text).
  // The agentic loop below will reassign to the richer block shape
  // before calling messages.create.
  const conversation: Anthropic.Messages.MessageParam[] = trimHistory(
    messages
  ).map((m) => ({ role: m.role, content: m.content }));

  // SSE stream. Each emit() writes one SSE event to the response.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      const client = new Anthropic({ apiKey });

      try {
        // Agentic loop: keep calling Claude until it returns end_turn
        // (no more tool_use blocks). The loop is bounded by
        // MAX_TOOL_ITERATIONS as a safety net.
        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          const response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            tools: ASK_TOOLS,
            messages: conversation,
          });

          // Stream the assistant text deltas to the client. With
          // tool-calling we use the non-streaming create() above and
          // then chunk the text out manually — fewer moving parts than
          // the SDK's streaming interface, and the user perceives
          // latency only on the first iteration anyway.
          for (const block of response.content) {
            if (block.type === "text" && block.text) {
              // Emit in word-sized chunks so the UI animates the
              // response naturally without a single giant payload.
              const words = block.text.split(/(\s+)/);
              for (const word of words) {
                if (word) emit({ type: "text_delta", delta: word });
              }
            }
          }

          // No tool calls → assistant is done, exit the loop.
          const toolUses = response.content.filter(
            (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
          );
          if (toolUses.length === 0 || response.stop_reason === "end_turn") {
            break;
          }

          // Push the assistant message (including tool_use blocks) onto
          // the conversation and execute each tool call.
          conversation.push({
            role: "assistant",
            content: response.content,
          });

          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            emit({ type: "tool_use", tool: tu.name, status: "running" });
            const result = await executeTool(tu.name, tu.input);
            emit({ type: "tool_use", tool: tu.name, status: "complete" });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: JSON.stringify(result),
              is_error: !result.ok,
            });
          }
          conversation.push({ role: "user", content: toolResults });
        }

        emit({ type: "complete", remaining: remainingAfter });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        console.error("[api/ask] error during streaming", err);
        emit({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  // v0.18 PR #74 — Vercel lambda-freeze guard. After the HTTP response
  // headers return, the JS event loop on a serverless function can
  // freeze (the SSE stream keeps the body open, but timer scheduling
  // is not guaranteed across the boundary on Vercel). PR #73 fixed
  // this for the Clerk webhook; askai_query_submitted had the same
  // latent vulnerability. Flushing now (capped at 2s) guarantees the
  // PostHog HTTP send completes before any post-response freeze. The
  // 2s cap means streaming start is delayed by at most ~150ms in the
  // common case, which is invisible next to the multi-second Claude
  // call that follows.
  await flushAnalyticsServer();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
