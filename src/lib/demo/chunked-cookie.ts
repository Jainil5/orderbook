/**
 * Cookie-backed demo stores can outgrow the 4096-byte per-cookie minimum that
 * browsers guarantee (RFC 6265): an over-sized Set-Cookie is silently dropped,
 * which loses saved orders/payments. Values are therefore sharded across
 * `<name>_c0..N` cookies, each small enough that even worst-case URL encoding
 * (3x) stays under the limit. Reads fall back to the legacy single cookie so
 * existing sessions migrate on their next write.
 */

const CHUNK_SIZE = 1200;

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

export function writeChunkedCookie(
  jar: CookieJar,
  name: string,
  value: string,
  options?: Record<string, unknown>,
): void {
  let previousCount = 0;
  while (jar.get(`${name}_c${previousCount}`)) previousCount++;
  const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, "g")) ?? [];
  chunks.forEach((chunk, i) => jar.set(`${name}_c${i}`, chunk, options));
  for (let i = chunks.length; i < previousCount; i++) {
    jar.delete(`${name}_c${i}`);
  }
  if (jar.get(name)) jar.delete(name);
}