import { loadDemoBrandPack } from "@/lib/demo/csv/load-pack";
import type { DemoBrandPack } from "@/lib/demo/brands/types";
import {
  DEFAULT_DEMO_BRAND_CODE,
  DEMO_BRAND_CODES,
  type DemoBrandCode,
} from "@/lib/workspace/constants";

export function getDemoBrandPack(code: DemoBrandCode): DemoBrandPack {
  return loadDemoBrandPack(code);
}

export function resolveDemoBrandCode(
  value: string | null | undefined,
): DemoBrandCode {
  if (!value) return DEFAULT_DEMO_BRAND_CODE;
  const normalized = value.trim().toUpperCase();
  if (normalized === "1") return "BR-1";
  if ((DEMO_BRAND_CODES as readonly string[]).includes(normalized)) {
    return normalized as DemoBrandCode;
  }
  return DEFAULT_DEMO_BRAND_CODE;
}