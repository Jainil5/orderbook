/**
 * Cookie-backed demo stores can outgrow the 4096-byte per-cookie minimum that
 * browsers guarantee (RFC 6265): an over-sized Set-Cookie is silently dropped,
 * which loses saved orders/payments. Values are therefore sharded across
 * `<name>_c0..N` cookies, each sized by its URL-ENCODED length (budget 3900
 * chars) — raw code-unit counts are unsafe because encodeURIComponent expands
 * BMP non-ASCII to 9 chars (₹ → %E2%82%B9) and astral pairs to 12. Chunking
 * iterates whole code points so surrogate pairs are never split. Reads fall
 * back to the legacy single cookie so existing sessions migrate on their next
 * write; the legacy cookie is only removed once every shard reads back.
 */

const MAX_ENCODED_CHUNK_LENGTH = 3900;

export type CookieJar = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
  delete(name: string): void;
};

export function readChunkedCookie(
  jar: CookieJar,
  name: string,
): string | undefined {
  const chunks: string[] = [];
  for (let i = 0; ; i++) {
    const chunk = jar.get(`${name}_c${i}`);
    if (!chunk) break;
    chunks.push(chunk.value);
  }
  if (chunks.length > 0) return chunks.join("");
  return jar.get(name)?.value;
}

function chunkByEncodedLength(value: string): string[] {
  const chunks: string[] = [];
  let current = "";
  let encodedLength = 0;
  for (const char of value) {
    // encodeURIComponent is additive per code point, so track the encoded
    // length incrementally instead of re-encoding the growing candidate.
    const charLength = encodeURIComponent(char).length;
    if (current && encodedLength + charLength > MAX_ENCODED_CHUNK_LENGTH) {
      chunks.push(current);
      current = "";
      encodedLength = 0;
    }
    current += char;
    encodedLength += charLength;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function writeChunkedCookie(
  jar: CookieJar,
  name: string,
  value: string,
  options?: Record<string, unknown>,
): void {
  let previousCount = 0;
  while (jar.get(`${name}_c${previousCount}`)) previousCount++;
  const chunks = chunkByEncodedLength(value);
  chunks.forEach((chunk, i) => jar.set(`${name}_c${i}`, chunk, options));
  const shardCount = Math.max(previousCount, chunks.length);
  const persisted = chunks.every(
    (chunk, i) => jar.get(`${name}_c${i}`)?.value === chunk,
  );
  if (!persisted) {
    // The browser silently dropped a shard. Remove the incomplete shard set
    // (reads would stop at the gap and yield truncated JSON) and keep the
    // legacy cookie as the last-known-good value instead of deleting it.
    for (let i = 0; i < shardCount; i++) jar.delete(`${name}_c${i}`);
    return;
  }
  for (let i = chunks.length; i < previousCount; i++) {
    jar.delete(`${name}_c${i}`);
  }
  if (jar.get(name)) jar.delete(name);
}
