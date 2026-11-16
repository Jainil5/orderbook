process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import type { CustomerInteraction } from "@/types/crm";
import { INTERACTION_TYPES } from "@/types/crm";
import {
  EMPTY_INTERACTION_INPUT,
  dueFollowUps,
  isFollowUpDue,
  sortInteractions,
  taskDraftFromInteraction,
  upcomingFollowUps,
  validateInteractionInput,
} from "./interactions";

const NOW = new Date("2026-11-16T09:00:00.000+05:30");
const KNOWN = { customerIds: ["c1", "c2"], staffIds: ["s1"], leadIds: ["l1"] };

function interaction(over: Partial<CustomerInteraction> = {}): CustomerInteraction {
  return {
    id: "i1",
    brand_id: "b1",
    customer_id: "c1",
    lead_id: null,
    type: "call",
    summary: "Called about the tasting",
    detail: null,
    occurred_at: "2026-11-10T10:00:00.000Z",
    staff_id: "s1",
    outcome: null,
    next_follow_up_at: null,
    task_id: null,
    attachment_url: null,
    ...over,
  };
}

function input(over: Partial<typeof EMPTY_INTERACTION_INPUT> = {}) {
  return { ...EMPTY_INTERACTION_INPUT, customer_id: "c1", summary: "Called", ...over };
}

describe("validateInteractionInput", () => {
  it("accepts a plain logged call", () => {
    const result = validateInteractionInput(input(), KNOWN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.customer_id).toBe("c1");
      expect(result.value.lead_id).toBeNull();
      expect(result.value.type).toBe("call");
    }
  });

  it("knows every interaction type it stores", () => {
    for (const type of INTERACTION_TYPES) {
      expect(validateInteractionInput(input({ type }), KNOWN).ok).toBe(true);
    }
    expect(validateInteractionInput(input({ type: "carrier-pigeon" }), KNOWN).ok).toBe(false);
  });

  it("requires one line of substance", () => {
    expect(validateInteractionInput(input({ summary: "   " }), KNOWN)).toEqual({
      ok: false,
      message: expect.stringMatching(/one line/i),
    });
  });

  it("attaches to a customer or a lead, never both and never neither", () => {
    expect(validateInteractionInput(input({ lead_id: "l1" }), KNOWN).ok).toBe(false);
    expect(validateInteractionInput(input({ customer_id: "", lead_id: "l1" }), KNOWN).ok).toBe(true);
    expect(validateInteractionInput(input({ customer_id: "" }), KNOWN)).toEqual({
      ok: false,
      message: expect.stringMatching(/customer or lead/i),
    });
  });

  it("refuses ids that are not in this brand's book", () => {
    expect(validateInteractionInput(input({ customer_id: "c99" }), KNOWN).ok).toBe(false);
    expect(validateInteractionInput(input({ customer_id: "", lead_id: "l99" }), KNOWN).ok).toBe(false);
    expect(validateInteractionInput(input({ staff_id: "s9" }), KNOWN).ok).toBe(false);
  });

  it("rejects a date that is not a date", () => {
    expect(validateInteractionInput(input({ occurred_at: "last tuesday" }), KNOWN).ok).toBe(false);
    expect(validateInteractionInput(input({ next_follow_up_at: "soon" }), KNOWN).ok).toBe(false);
  });

  it("defaults an undated interaction to the moment it was logged", () => {
    const result = validateInteractionInput(input({ occurred_at: "" }), KNOWN);
    expect(result.ok && new Date(result.value.occurred_at).getTime()).toBeCloseTo(Date.now(), -4);
  });

  it("stores a real instant for the local wall clock the form sends", () => {
    const result = validateInteractionInput(input({ occurred_at: "2026-11-14T18:30" }), KNOWN);
    expect(result.ok && result.value.occurred_at).toBe("2026-11-14T13:00:00.000Z");
  });

  it("keeps only a web link as an attachment", () => {
    expect(validateInteractionInput(input({ attachment_url: "javascript:alert(1)" }), KNOWN).ok).toBe(false);
    expect(validateInteractionInput(input({ attachment_url: "/uploads/invoice.pdf" }), KNOWN).ok).toBe(false);
    const ok = validateInteractionInput(input({ attachment_url: "https://example.in/a.pdf" }), KNOWN);
    expect(ok.ok && ok.value.attachment_url).toBe("https://example.in/a.pdf");
  });

  it("trims and caps the free-text fields", () => {
    const result = validateInteractionInput(
      input({ summary: `  ${"a".repeat(200)}  `, detail: "b".repeat(1200), outcome: "  agreed  " }),
      KNOWN,
    );
    expect(result.ok && result.value.summary).toHaveLength(160);
    expect(result.ok && result.value.detail).toHaveLength(1001);
    expect(result.ok && result.value.outcome).toBe("agreed");
  });
});

describe("follow-ups", () => {
  it("ignores interactions that never promised one", () => {
    expect(isFollowUpDue(interaction({ next_follow_up_at: null }), NOW)).toBe(false);
  });

  it("judges a bare date against the end of the local day", () => {
    expect(isFollowUpDue(interaction({ next_follow_up_at: "2026-11-16" }), NOW)).toBe(false);
    expect(isFollowUpDue(interaction({ next_follow_up_at: "2026-11-15" }), NOW)).toBe(true);
  });

  it("orders the overdue list by how long it has been waiting", () => {
    const rows = [
      interaction({ id: "a", next_follow_up_at: "2026-11-14T09:00:00.000Z" }),
      interaction({ id: "b", next_follow_up_at: "2026-11-10T09:00:00.000Z" }),
      interaction({ id: "c", next_follow_up_at: "2026-11-20T09:00:00.000Z" }),
      interaction({ id: "d", next_follow_up_at: null }),
    ];
    expect(dueFollowUps(rows, NOW).map((i) => i.id)).toEqual(["b", "a"]);
    expect(upcomingFollowUps(rows, NOW).map((i) => i.id)).toEqual(["c"]);
  });

  it("treats a follow-up due this instant as still ahead", () => {
    const rows = [interaction({ next_follow_up_at: "2026-11-16T09:00:00.000+05:30" })];
    expect(dueFollowUps(rows, NOW)).toEqual([]);
    expect(upcomingFollowUps(rows, NOW)).toHaveLength(1);
  });
});

describe("taskDraftFromInteraction", () => {
  it("prefixes the title and carries the owner and the due date", () => {
    const draft = taskDraftFromInteraction(
      interaction({
        summary: "Chase the deposit for the 40-seat quote",
        staff_id: "s1",
        next_follow_up_at: "2026-11-18T09:00:00.000Z",
        outcome: "Awaiting the PO",
        detail: "Finance signs on Tuesdays.",
      }),
    );
    expect(draft.title).toBe("Follow up: Chase the deposit for the 40-seat quote");
    expect(draft.assigneeStaffId).toBe("s1");
    expect(draft.customerId).toBe("c1");
    expect(draft.dueAt).toBe("2026-11-18T09:00:00.000Z");
    expect(draft.priority).toBe("medium");
    expect(draft.description).toBe("Outcome so far: Awaiting the PO\n\nFinance signs on Tuesdays.");
  });

  it("escalates a complaint follow-up to high", () => {
    expect(taskDraftFromInteraction(interaction({ type: "complaint" })).priority).toBe("high");
  });

  it("says so when the follow-up belongs to a lead that has not converted", () => {
    const draft = taskDraftFromInteraction(
      interaction({ customer_id: null, lead_id: "l1", summary: "Site visit" }),
    );
    expect(draft.customerId).toBeNull();
    expect(draft.description).toMatch(/not converted/i);
  });

  it("caps the title the task list can render", () => {
    const draft = taskDraftFromInteraction(interaction({ summary: "x".repeat(200) }));
    expect(draft.title).toHaveLength(120);
  });
});

describe("sortInteractions", () => {
  it("puts the most recent touchpoint first without touching the input", () => {
    const rows = [
      interaction({ id: "old", occurred_at: "2026-01-01T10:00:00.000Z" }),
      interaction({ id: "new", occurred_at: "2026-11-11T10:00:00.000Z" }),
    ];
    expect(sortInteractions(rows).map((i) => i.id)).toEqual(["new", "old"]);
    expect(rows.map((i) => i.id)).toEqual(["old", "new"]);
  });
});
