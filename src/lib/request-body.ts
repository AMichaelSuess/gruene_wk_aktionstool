export class BodyTooLargeError extends Error {
  constructor() {
    super("Anfrage zu groß");
    this.name = "BodyTooLargeError";
  }
}

/**
 * Reads a JSON request body, but stops as soon as it exceeds `maxBytes`
 * (checked against Content-Length up front and while streaming, so a chunked
 * request without Content-Length cannot make the server buffer an unbounded
 * body). Throws BodyTooLargeError when the limit is exceeded and SyntaxError
 * for invalid JSON.
 */
export async function readJsonLimited(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new BodyTooLargeError();

  if (!req.body) return JSON.parse("");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
