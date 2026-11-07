import { getDemoBrandPack } from "@/lib/demo/brands";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { mergeStaff } from "@/lib/manager/staff";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { StaffMember } from "@/types/manager";

export async function listDemoStaff(
  brandCode?: DemoBrandCode,
): Promise<StaffMember[]> {
  const code = brandCode ?? "BR-1";
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  return mergeStaff(pack.staff, bucket.staff ?? [], bucket.staffOverrides ?? {});
}