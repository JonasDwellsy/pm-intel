"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Client-side chat for /ask. Owns the conversation state, streaming
// fetch handling, suggested-query interactions, and rate-limit display.
//
// Streaming protocol: POST /api/ask returns text/event-stream with
// JSON-line events. Event shapes match the route handler:
//   { type: "text_delta", delta: string }
//   { type: "tool_use", tool: string, status: "running" | "complete" }
//   { type: "complete", remaining: number }
//   { type: "error", error: string }
//
// The chat renders user bubbles right-aligned and assistant bubbles
// left-aligned with markdown + GFM (tables, strikethrough). Tool-use
// indicators appear as italic muted text below the streaming assistant
// message while a tool is in flight.

interface Message {
  role: "user" | "assistant";
  content: string;
  toolEvents?: Array<{ tool: string; status: "running" | "complete" }>;
}

const SUGGESTIONS: string[] = [
  "Show me Memphis operators with rising share but slow DOM",
  "Compare Invitation Homes across markets",
  "Which Phoenix institutional operators have gold stars on rent performance?",
  "What's the largest operator in each Tennessee market?",
];

export function AskChat({ dataAsOf }: { dataAsOf: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the conversation pane to the bottom on every message
  // delta. Smooth scroll keeps it from feeling abrupt during streaming.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, streaming]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const assistantPlaceholder: Message = {
      role: "assistant",
      content: "",
      toolEvents: [],
    };

    // Snapshot the conversation before the placeholder so we POST only
    // real turns (the server expects last message = user).
    const transcript = [...messages, userMessage];

    setMessages([...transcript, assistantPlaceholder]);
    setInput("");
    setStreaming(true);
    setGlobalError(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: transcript }),
      });

      if (res.status === 429) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setGlobalError(
          body?.error ?? "Daily query limit reached. Try again tomorrow."
        );
        setRemaining(0);
        // Pop the placeholder since we won't fill it.
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      if (!res.ok || !res.body) {
        setGlobalError("Something went wrong. Try again in a moment.");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // SSE protocol: events are separated by "\n\n", each starts with
      // "data: " followed by the JSON payload. We parse incrementally,
      // applying deltas to the last assistant message.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nlIdx;
        while ((nlIdx = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 2);
          if (!event.startsWith("data: ")) continue;
          const payloadStr = event.slice(6);
          let payload:
            | { type: "text_delta"; delta: string }
            | { type: "tool_use"; tool: string; status: "running" | "complete" }
            | { type: "complete"; remaining: number }
            | { type: "error"; error: string };
          try {
            payload = JSON.parse(payloadStr);
          } catch {
            continue;
          }

          if (payload.type === "text_delta") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: last.content + payload.delta,
                };
              }
              return next;
            });
          } else if (payload.type === "tool_use") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                const events = [...(last.toolEvents ?? [])];
                if (payload.status === "running") {
                  events.push({ tool: payload.tool, status: "running" });
                } else {
                  // Mark the latest running event for this tool as complete.
                  for (let i = events.length - 1; i >= 0; i--) {
                    if (
                      events[i].tool === payload.tool &&
                      events[i].status === "running"
                    ) {
                      events[i] = { tool: payload.tool, status: "complete" };
                      break;
                    }
                  }
                }
                next[next.length - 1] = { ...last, toolEvents: events };
              }
              return next;
            });
          } else if (payload.type === "complete") {
            setRemaining(payload.remaining);
          } else if (payload.type === "error") {
            setGlobalError(payload.error);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setGlobalError("Network error. Try again in a moment.");
    } finally {
      setStreaming(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter or plain Enter (without Shift) submits.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const showSuggestions = messages.length === 0 && !streaming;

  return (
    <div className="flex h-full flex-col">
      {/* Page intro */}
      <div className="mx-auto w-full max-w-[820px] px-6 pt-12 pb-6">
        <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
          Ask Dwellsy IQ
        </p>
        <h1 className="mt-2 text-[32px] font-semibold leading-[1.1] tracking-[-0.012em] text-navy">
          Ask Dwellsy IQ
        </h1>
        <p className="mt-2 text-[15px] leading-[1.5] text-foreground/75">
          Ask anything about the operators, markets, and methodology in
          coverage. Powered by Claude, backed by the same data that runs
          the scorecards.
        </p>
      </div>

      {/* Scrollable conversation pane */}
      <div
        ref={scrollRef}
        className="mx-auto w-full max-w-[820px] flex-1 overflow-y-auto px-6"
      >
        {showSuggestions && (
          <div className="space-y-3 pb-6">
            <p className="dq-eyebrow-muted text-[11px] tracking-[0.14em]">
              Try a question
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-lg border border-grid bg-white px-4 py-3 text-left text-[13.5px] leading-[1.4] text-navy transition-colors hover:border-navy hover:bg-navy-soft"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-5 pb-6">
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
        </div>

        {globalError && (
          <div className="my-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13.5px] text-destructive">
            {globalError}
          </div>
        )}
      </div>

      {/* Input bar pinned to bottom */}
      <div className="border-t border-grid bg-white">
        <div className="mx-auto w-full max-w-[820px] px-6 py-4">
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about operators, markets, or methodology…"
              rows={1}
              disabled={streaming}
              className="min-h-[44px] max-h-[140px] flex-1 resize-y rounded-md border border-grid bg-white px-3 py-2.5 text-[14.5px] text-navy outline-none transition-colors focus:border-navy focus:ring-2 focus:ring-navy/15 disabled:bg-navy-soft/40 disabled:text-foreground/50"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={streaming || !input.trim()}
              className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 text-[14px] font-semibold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {streaming ? "Thinking…" : "Send"}
            </button>
          </div>
          <p className="mt-2.5 flex items-center justify-between text-[11.5px] text-muted-foreground">
            <span>
              Powered by Claude. Rate-limited to 25 queries per day. Data
              current to {dataAsOf}.
            </span>
            {remaining !== null && remaining <= 5 && (
              <span className="font-semibold text-navy">
                {remaining} queries left today
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-navy px-4 py-2.5 text-[14.5px] leading-[1.45] text-white">
          {message.content}
        </div>
      </div>
    );
  }

  const runningTool = message.toolEvents?.find((e) => e.status === "running");

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-2">
        <div className="rounded-2xl rounded-tl-md border border-grid bg-white px-4 py-3 text-[14.5px] leading-[1.5] text-navy">
          {message.content ? (
            <div className="dq-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            <span className="text-muted-foreground italic">Thinking…</span>
          )}
        </div>
        {runningTool && (
          <p className="px-2 text-[12px] italic text-muted-foreground">
            Looking up {humanizeTool(runningTool.tool)}…
          </p>
        )}
      </div>
    </div>
  );
}

function humanizeTool(name: string): string {
  switch (name) {
    case "searchOperators":
      return "operators";
    case "listMarkets":
      return "markets";
    case "getMarket":
      return "market data";
    case "getOperatorScorecard":
      return "scorecard data";
    case "getCanonicalOperator":
      return "cross-market operator data";
    case "filterOperators":
      return "filtered operators";
    case "compareOperators":
      return "comparison data";
    default:
      return name;
  }
}
