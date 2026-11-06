import type { BrandRole } from "@/types/database";

export function canEditBrandSettings(role: BrandRole): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

export function canManageCatalog(role: BrandRole): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

/** Refunds, credit notes, stock adjustments, status changes on posted orders. */
export function canManageOrderOperations(role: BrandRole): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

/** Record payments at checkout / order detail (staff included). */
export function canRecordPayments(role: BrandRole): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "manager" ||
    role === "staff"
  );
}
