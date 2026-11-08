import type { FieldVisit, FieldVisitStatus } from "@/types/operations";

export const VISIT_STATUS_LABELS: Record<FieldVisitStatus, string> = {
  planned: "Planned",
  checked_in: "Checked in",
  completed: "Completed",
};

export type VisitInput = { customerId: string; staffId: string; purpose: string };

export function validateVisitInput(
  input: VisitInput,
  known: { customerIds: string[]; staffIds: string[] },
):
  | { ok: true; value: { customerId: string; staffId: string; purpose: string } }
  | { ok: false; message: string } {
  if (!known.customerIds.includes(input.customerId)) return { ok: false, message: "Pick a valid customer." };
  if (!known.staffIds.includes(input.staffId)) return { ok: false, message: "Pick a valid staff member." };
  const purpose = input.purpose.trim().slice(0, 200);
  if (!purpose) return { ok: false, message: "Purpose is required." };
  return { ok: true, value: { customerId: input.customerId, staffId: input.staffId, purpose } };
}

export function visitTransitionError(
  visit: FieldVisit,
  action: "check_in" | "check_out",
  report?: string,
): string | null {
  if (action === "check_in") {
    return visit.status === "planned" ? null : "Only planned visits can be checked in.";
  }
  if (visit.status !== "checked_in") return "Only checked-in visits can be checked out.";
  if (!report?.trim()) return "Add a visit report before completing.";
  return null;
}