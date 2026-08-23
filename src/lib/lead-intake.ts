export const MAX_LEAD_REQUEST_BYTES = 16 * 1024;

export type LeadBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 | 415; error: string };

export function isLeadBotTrapFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function readLeadJsonBody(
  request: Request,
  maxBytes = MAX_LEAD_REQUEST_BYTES
): Promise<LeadBodyResult> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return {
      ok: false,
      status: 415,
      error: "Content-Type must be application/json",
    };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      return { ok: false, status: 413, error: "Request body is too large" };
    }
  }

  if (!request.body) {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413, error: "Request body is too large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "Invalid request body" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }
}
