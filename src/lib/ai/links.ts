/**
 * Client-safe links for the AI area: plain route strings and nothing else.
 *
 * `channels.ts` reads live integration state and must never be imported by a
 * client component; anything a client needs from this area's chrome lives here
 * instead, so the boundary stays one-way.
 */

export const INTEGRATIONS_HREF = "/manager/productivity/integrations";
