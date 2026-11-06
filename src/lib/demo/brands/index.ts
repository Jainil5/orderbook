import { BREWERY_CAFE_DEMO } from "@/lib/demo/brands/brewery-cafe";
import { CUBIG_FURNITURE_DEMO } from "@/lib/demo/brands/cubig-furniture";
import type { DemoBrandPack } from "@/lib/demo/brands/types";
import {
  DEFAULT_DEMO_BRAND_CODE,
  type DemoBrandCode,
} from "@/lib/workspace/constants";

const PACKS: Record<DemoBrandCode, DemoBrandPack> = {
  "BR-1": BREWERY_CAFE_DEMO,
  "BR-2": CUBIG_FURNITURE_DEMO,
};

export function getDemoBrandPack(code: DemoBrandCode): DemoBrandPack {
  return PACKS[code];
}

export function resolveDemoBrandCode(
  value: string | null | undefined,
): DemoBrandCode {
  if (!value) return DEFAULT_DEMO_BRAND_CODE;
  const normalized = value.trim().toUpperCase();
  if (normalized === "1") return "BR-1";
  if (normalized in PACKS) return normalized as DemoBrandCode;
  return DEFAULT_DEMO_BRAND_CODE;
}

export { BREWERY_CAFE_DEMO, CUBIG_FURNITURE_DEMO };
