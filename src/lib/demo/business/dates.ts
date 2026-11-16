/**
 * Date helpers for the seeded business fixtures. Fixture files describe
 * "today's operations", so dates stay relative to the run time the same way
 * `lib/demo/brands/*.ts` does it for appointments and shifts.
 */

export function isoDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function isoInstant(offsetDays = 0, hours = 0, minutes = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  d.setHours(d.getHours() + hours, d.getMinutes() + minutes, 0, 0);
  return d.toISOString();
}

/** ISO timestamp with an explicit local hour, for events anchored to a time of day. */
export function isoAt(hour: number, minute = 0, offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
