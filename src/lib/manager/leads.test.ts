import { describe, expect, it } from "vitest";
import {
  LEAD_STAGE_LABELS,
  isLeadOverdue,
  leadStageNeighbours,
  pipelineSummary,
  validateLeadInput,
  type LeadInput,
} from "./leads";
import type { Lead } from "@/types/operations";

function leadRow(over: Partial<Lead> = {}): Lead {
  return {
    id: "l1",
    brand_id: "b",
    contact_name: "Asha Sheth",
    phone: null,
    email: null,
    source: null,
    requirement: "Two wardrobes",
    site_address: null,
    stage: "new",
    estimated_value: 100000,
    owner_staff_id: null,
    next_action_at: null,
    quotation_number: null,
    created_at: "2026-11-01T09:00:00.000Z",
    ...over,
  };
}

function input(over: Partial<LeadInput> = {}): LeadInput {
  return {
    contact_name: "Asha Sheth",
    phone: "+91 98250 11111",
    email: "",
    source: "Walk-in",
    requirement: "Two wardrobes and a dressing table",
    site_address: "Vesu, Surat",
    stage: "new",
    estimated_value: "165000",
    owner_staff_id: "cf-staff-1",
    next_action_at: "2026-11-14",
    ...over,
  };
}

const NOW = new Date(2026, 10, 11, 12, 0, 0);

describe("validateLeadInput", () => {
  it("accepts a complete enquiry and coerces the money and follow-up fields", () => {
    const parsed = validateLeadInput(input(), { staffIds: ["cf-staff-1"] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.estimated_value).toBe(165000);
    expect(parsed.value.email).toBeNull();
    expect(parsed.value.next_action_at).toBe(
      new Date(2026, 10, 14, 9, 0).toISOString(),
    );
    expect(parsed.value.contact_name).toBe("Asha Sheth");
  });

  it("requires a name and something to quote for", () => {
    expect(validateLeadInput(input({ contact_name: "  " }), {}).message).toMatch(
      /name/i,
    );
    expect(validateLeadInput(input({ requirement: "" }), {}).message).toMatch(
      /requirement/i,
    );
  });

  it("rejects a value that is not a whole number of rupees", () => {
    expect(validateLeadInput(input({ estimated_value: "abc" }), {}).message).toMatch(
      /value/i,
    );
    expect(validateLeadInput(input({ estimated_value: "-500" }), {}).ok).toBe(false);
  });

  it("rejects an email that is not an email", () => {
    expect(validateLeadInput(input({ email: "asha@" }), {}).message).toMatch(/email/i);
  });

  it("rejects an owner who is not on the staff list", () => {
    expect(
      validateLeadInput(input({ owner_staff_id: "ghost" }), {
        staffIds: ["cf-staff-1"],
      }).message,
    ).toMatch(/owner/i);
  });

  it("lets a lead sit unassigned with no follow-up date", () => {
    const parsed = validateLeadInput(
      input({ owner_staff_id: "", next_action_at: "" }),
      { staffIds: [] },
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.owner_staff_id).toBeNull();
    expect(parsed.value.next_action_at).toBeNull();
  });
});

describe("leadStageNeighbours", () => {
  it("walks the board left and right without leaving it", () => {
    expect(leadStageNeighbours("site_visit")).toEqual({
      back: "new",
      forward: "quote_sent",
    });
    expect(leadStageNeighbours("new").back).toBeNull();
    expect(leadStageNeighbours("lost").forward).toBeNull();
  });
});

describe("isLeadOverdue", () => {
  it("flags a live lead whose follow-up date has passed", () => {
    expect(
      isLeadOverdue(leadRow({ next_action_at: "2026-11-09T09:00:00.000Z" }), NOW),
    ).toBe(true);
  });
  it("never flags a closed lead or one with no follow-up", () => {
    expect(
      isLeadOverdue(
        leadRow({
          stage: "won",
          next_action_at: "2026-11-09T09:00:00.000Z",
        }),
        NOW,
      ),
    ).toBe(false);
    expect(isLeadOverdue(leadRow(), NOW)).toBe(false);
  });
});

describe("pipelineSummary", () => {
  const leads = [
    leadRow({ id: "a", stage: "new", estimated_value: 240000 }),
    leadRow({ id: "b", stage: "site_visit", estimated_value: 165000 }),
    leadRow({ id: "c", stage: "quote_sent", estimated_value: 512000 }),
    leadRow({ id: "d", stage: "negotiating", estimated_value: 485000 }),
    leadRow({ id: "e", stage: "won", estimated_value: 228000 }),
    leadRow({ id: "f", stage: "lost", estimated_value: 98000 }),
  ];

  it("separates live pipeline money from closed deals", () => {
    const summary = pipelineSummary(leads);
    expect(summary.openCount).toBe(4);
    expect(summary.openValue).toBe(240000 + 165000 + 512000 + 485000);
    expect(summary.wonValue).toBe(228000);
    expect(summary.closedCount).toBe(2);
  });

  it("reports the win rate over closed deals only", () => {
    expect(pipelineSummary(leads).winRatePercent).toBe(50);
    expect(pipelineSummary([]).winRatePercent).toBeNull();
  });

  it("counts every stage so the board headers can show a total", () => {
    const byStage = pipelineSummary(leads).byStage;
    expect(byStage.new).toEqual({
      count: 1,
      value: 240000,
      label: LEAD_STAGE_LABELS.new,
    });
    expect(Object.keys(byStage)).toHaveLength(6);
  });
});
