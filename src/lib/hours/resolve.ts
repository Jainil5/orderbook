/**
 * The same answer for two different readers.
 *
 * `seedWorkingHours` is the shipped schedule — CSV column first, built-in
 * default if a pack ever ships something unreadable. `resolveWorkingHours`
 * adds this browser's edit on top, so a visitor who moved the hours in the
 * workspace sees the same pill on the public site that the till shows.
 *
 * The public brand site has no workspace cookie to lean on, which is why it
 * gets its own entry point: with no pref stored the seed simply comes back,
 * the same rule the demo follows everywhere — edits live in the browser that
 * made them.
 */
import { getDemoBrandPack, resolveDemoBrandCode } from "@/lib/demo/brands";
import { readOrdersPausedPref, readWorkingHoursPref } from "@/lib/workspace/prefs";
import {
  DEFAULT_WORKING_HOURS,
  parseWorkingHours,
  type WorkingHours,
} from "./working-hours";

export type ResolvedWorkingHours = {
  hours: WorkingHours;
  ordersPaused: boolean;
};

export function seedWorkingHours(brandCode: string): WorkingHours {
  const pack = getDemoBrandPack(resolveDemoBrandCode(brandCode));
  return parseWorkingHours(pack.settings.working_hours_json) ?? DEFAULT_WORKING_HOURS;
}

export async function resolveWorkingHours(
  brandCode: string,
): Promise<ResolvedWorkingHours> {
  const code = resolveDemoBrandCode(brandCode);
  const hoursPref = await readWorkingHoursPref(code);
  const pausedPref = await readOrdersPausedPref(code);
  return {
    hours: hoursPref ?? seedWorkingHours(code),
    ordersPaused: pausedPref ?? false,
  };
}
