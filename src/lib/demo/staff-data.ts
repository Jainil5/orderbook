import { getDemoBrandPack } from "@/lib/demo/brands";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { StaffMember } from "@/types/manager";

/**
 * The brand's roster, straight from `staff.csv` — the pack's `staff` array is
 * the file. Rosters are shown alphabetically, which is the order the old bucket
 * merge applied, so the sort stays here now that there is no merge.
 */
export async function listDemoStaff(
  brandCode?: DemoBrandCode,
): Promise<StaffMember[]> {
  const pack = getDemoBrandPack(brandCode ?? "BR-1");
  return [...pack.staff].sort((a, b) => a.name.localeCompare(b.name));
}
