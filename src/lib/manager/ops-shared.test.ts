import { describe, expect, it } from "vitest";
import { mergeOpsEntities } from "./ops-shared";

type Row = { id: string; name: string };

describe("mergeOpsEntities", () => {
  const base: Row[] = [{ id: "b1", name: "Fixture" }];
  const added: Row[] = [{ id: "a1", name: "Created" }];

  it("merges base and additions", () => {
    expect(mergeOpsEntities(base, added, {})).toHaveLength(2);
  });

  it("applies overrides without mutating inputs", () => {
    const merged = mergeOpsEntities(base, [], { b1: { name: "Renamed" } });
    expect(merged[0].name).toBe("Renamed");
    expect(base[0].name).toBe("Fixture");
  });

  it("tombstones remove fixture and created records", () => {
    expect(mergeOpsEntities(base, added, { b1: { deleted: true }, a1: { deleted: true } })).toEqual([]);
  });

  it("does not leak the deleted flag onto surviving records", () => {
    const merged = mergeOpsEntities(base, [], { b1: { name: "X", deleted: false } });
    expect(merged[0]).toEqual({ id: "b1", name: "X" });
  });

  it("additions win over base on id collision", () => {
    const merged = mergeOpsEntities(base, [{ id: "b1", name: "New" }], {});
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("New");
  });
});
