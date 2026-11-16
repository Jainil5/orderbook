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

/**
 * CRM configuration and marketing: segments, campaigns, loyalty settings,
 * memberships, complaint handling, deleting pipeline records.
 */
export function canManageCrm(role: BrandRole): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

/** Logging a call/visit/note and moving a lead forward — staff included. */
export function canLogCrmActivity(role: BrandRole): boolean {
  return canManageCrm(role) || role === "staff";
}
