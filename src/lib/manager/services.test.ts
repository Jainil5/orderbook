import { describe, expect, it } from "vitest";
import { jobAdvanceError, nextJobStatus, validateServiceInput, validateServiceJobInput } from "./services";
import type { ServiceJob } from "@/types/operations";

describe("validateServiceInput", () => {
  it("accepts a valid service and rounds price", () => {
    const r = validateServiceInput({ name: " Delivery ", description: " x ", durationMinutes: "60", price: "499.999" });
    expect(r).toEqual({ ok: true, value: { name: "Delivery", description: "x", durationMinutes: 60, price: 500 } });
  });
  it("rejects empty name", () => {
    expect(validateServiceInput({ name: " ", durationMinutes: "60", price: "10" }).ok).toBe(false);
  });
  it("rejects out-of-range duration", () => {
    expect(validateServiceInput({ name: "A", durationMinutes: "2", price: "10" }).ok).toBe(false);
    expect(validateServiceInput({ name: "A", durationMinutes: "500", price: "10" }).ok).toBe(false);
  });
  it("rejects negative price", () => {
    expect(validateServiceInput({ name: "A", durationMinutes: "60", price: "-1" }).ok).toBe(false);
  });
});

describe("job status chain", () => {
  it("advances requested → scheduled → in_progress → completed → null", () => {
    expect(nextJobStatus("requested")).toBe("scheduled");
    expect(nextJobStatus("scheduled")).toBe("in_progress");
    expect(nextJobStatus("in_progress")).toBe("completed");
    expect(nextJobStatus("completed")).toBeNull();
  });
  const job: ServiceJob = { id: "j", brand_id: "b", serviceId: "s", customerId: "c", staffIds: [], status: "requested", scheduledAt: null, notes: "" };
  it("blocks scheduling without staff and time", () => {
    expect(jobAdvanceError(job)).not.toBeNull();
    expect(jobAdvanceError({ ...job, staffIds: ["st1"], scheduledAt: "2026-11-09T10:00:00.000Z" })).toBeNull();
  });
  it("blocks advancing a completed job", () => {
    expect(jobAdvanceError({ ...job, status: "completed" })).not.toBeNull();
  });
});

describe("validateServiceJobInput", () => {
  const known = { serviceIds: ["s1"], customerIds: ["c1"], staffIds: ["st1"] };
  it("accepts known ids and optional empty staff", () => {
    expect(validateServiceJobInput({ serviceId: "s1", customerId: "c1", staffIds: [] }, known).ok).toBe(true);
  });
  it("rejects unknown service, customer or staff", () => {
    expect(validateServiceJobInput({ serviceId: "no", customerId: "c1", staffIds: [] }, known).ok).toBe(false);
    expect(validateServiceJobInput({ serviceId: "s1", customerId: "no", staffIds: [] }, known).ok).toBe(false);
    expect(validateServiceJobInput({ serviceId: "s1", customerId: "c1", staffIds: ["no"] }, known).ok).toBe(false);
  });
});