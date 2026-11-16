process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import type { Customer } from "@/types/database";
import type { CustomerProfile } from "./metrics";
import {
  CUSTOMER_CSV_HEADERS,
  DEFAULT_DIRECTORY_STATE,
  DEFAULT_PAGE_SIZE,
  SORT_KEYS,
  customersToCsvRows,
  daysQuiet,
  directoryFromParams,
  directoryToParams,
  filterDirectory,
  findDuplicates,
  matchesQuery,
  paginateDirectory,
  queryDirectory,
  sortDirectory,
} from "./directory";

const NOW = new Date("2026-11-16T09:00:00.000+05:30");

function profile(over: { customer?: Partial<Customer> } & Record<string, unknown> = {}): CustomerProfile {
  const customer: Customer = {
    id: "c1",
    brand_id: "b1",
    name: "Anjali Shah",
    email: "anjali@example.in",
    phone: "+91 98250 11111",
    ...over.customer,
  };
  return {
    orders: 4,
    lifetimeValue: 8000,
    avgOrderValue: 2000,
    dues: 0,
    billsWithDues: 0,
    cancelledOrRefunded: 0,
    firstOrderAt: "2026-02-01T04:00:00.000Z",
    lastOrderAt: "2026-11-01T04:00:00.000Z",
    daysSinceLastOrder: 15,
    joinedAt: "2026-01-01T04:00:00.000Z",
    daysSinceJoin: 320,
    reviewCount: 0,
    avgRating: null,
    openComplaints: 0,
    loyaltyPoints: 0,
    loyaltyTierId: null,
    membershipTierId: null,
    tags: [],
    source: "Walk-in",
    priceTier: "retail",
    status: "active",
    ...over,
    customer,
  } as CustomerProfile;
}

const BOOK = [
  profile({
    customer: {
      id: "vip",
      name: "Priya Homes Interiors",
      email: "projects@priyahomes.in",
      phone: "+91 98100 33445",
      tags: ["trade", "designer"],
      source: "Referral",
      price_tier: "wholesale",
      marketing_consent: true,
      custom_fields: { "GST number": "24AAACP1111A1ZK" },
    },
    orders: 22,
    lifetimeValue: 640000,
    avgRating: 5,
    reviewCount: 3,
    dues: 120000,
    billsWithDues: 2,
    loyaltyPoints: 3200,
    loyaltyTierId: "gold",
    daysSinceLastOrder: 8,
    source: "Referral",
    tags: ["trade", "designer"],
    priceTier: "wholesale",
  }),
  profile({
    customer: { id: "quiet", name: "Tejas Panchal", phone: "098250 11111", source: "Instagram" },
    orders: 1,
    lifetimeValue: 1500,
    avgRating: 2,
    reviewCount: 1,
    openComplaints: 1,
    lastOrderAt: "2026-08-12T09:00:00.000+05:30",
    daysSinceLastOrder: 96,
    source: "Instagram",
  }),
  profile({
    customer: { id: "fresh", name: "Nisha Doshi", email: null, created_at: "2026-11-05T10:00:00.000Z" },
    orders: 0,
    lifetimeValue: 0,
    avgRating: null,
    reviewCount: 0,
    loyaltyPoints: 0,
    loyaltyTierId: null,
    daysSinceLastOrder: null,
    lastOrderAt: null,
    firstOrderAt: null,
    daysSinceJoin: 11,
  }),
];

describe("matchesQuery", () => {
  it("finds a customer by name, email, phone or tag", () => {
    for (const q of ["priya", "PRIYA HOMES", "projects@priyahomes", "33445", "98100 33445", "designer", "trade"]) {
      expect(matchesQuery(BOOK[0], q), q).toBe(true);
    }
  });

  it("requires every token to appear somewhere", () => {
    expect(matchesQuery(BOOK[0], "priya designer")).toBe(true);
    expect(matchesQuery(BOOK[0], "priya walker")).toBe(false);
  });

  it("reaches into the brand's own custom fields", () => {
    expect(matchesQuery(BOOK[0], "24AAACP1111A1ZK")).toBe(true);
  });

  it("returns everything for an empty or whitespace search", () => {
    expect(matchesQuery(BOOK[2], "   ")).toBe(true);
  });

  it("does not invent a match for a customer with no email", () => {
    expect(matchesQuery(BOOK[2], "@")).toBe(false);
  });
});

describe("filterDirectory", () => {
  const filter = (over: Partial<Parameters<typeof filterDirectory>[1]>) =>
    filterDirectory(BOOK, { ...DEFAULT_DIRECTORY_STATE, ...over }, NOW).map((p) => p.customer.id);

  it("splits the book by health band", () => {
    expect(filter({ health: "all" })).toEqual(["vip", "quiet", "fresh"]);
    expect(filter({ health: "at_risk" })).toEqual(["quiet"]);
    expect(filter({ health: "new" })).toEqual(["fresh"]);
    expect(filter({ health: "dues" })).toEqual(["vip"]);
    expect(filter({ health: "complaints" })).toEqual(["quiet"]);
  });

  it("applies the same rule engine a saved segment uses", () => {
    expect(filter({ rules: { minSpend: 500000 } })).toEqual(["vip"]);
    expect(filter({ rules: { minOrders: 1 } })).toEqual(["vip", "quiet"]);
    expect(filter({ rules: { minRating: 4 } })).toEqual(["vip"]);
  });

  it("intersects a segment's membership with the other filters", () => {
    expect(filter({ memberIds: new Set(["vip", "quiet"]) })).toEqual(["vip", "quiet"]);
    expect(filter({ memberIds: new Set(["vip", "quiet"]), rules: { hasOutstandingDues: true } })).toEqual([
      "vip",
    ]);
    expect(filter({ memberIds: new Set(["nobody"]) })).toEqual([]);
  });

  it("stacks search on top of band and rules", () => {
    expect(filter({ q: "panchal", health: "all" })).toEqual(["quiet"]);
    expect(filter({ q: "panchal", health: "dues" })).toEqual([]);
  });
});

describe("sortDirectory", () => {
  const ids = (key: (typeof SORT_KEYS)[number], dir: "asc" | "desc") =>
    sortDirectory(BOOK, key, dir).map((p) => p.customer.id);

  it("sorts names alphabetically in both directions", () => {
    expect(ids("name", "asc")).toEqual(["fresh", "vip", "quiet"]);
    expect(ids("name", "desc")).toEqual(["quiet", "vip", "fresh"]);
  });

  it("sorts every measured column highest-first", () => {
    expect(ids("spend", "desc")).toEqual(["vip", "quiet", "fresh"]);
    expect(ids("orders", "desc")).toEqual(["vip", "quiet", "fresh"]);
    expect(ids("due", "desc")).toEqual(["vip", "quiet", "fresh"]);
    expect(ids("rating", "desc")).toEqual(["vip", "quiet", "fresh"]);
    expect(ids("points", "desc")).toEqual(["vip", "quiet", "fresh"]);
  });

  it("keeps a customer who has never bought at the bottom of recency", () => {
    expect(ids("last_order", "desc")).toEqual(["vip", "quiet", "fresh"]);
    expect(ids("last_order", "asc")).toEqual(["fresh", "quiet", "vip"]);
  });

  it("does not reorder the caller's array", () => {
    const before = BOOK.map((p) => p.customer.id);
    sortDirectory(BOOK, "spend", "desc");
    expect(BOOK.map((p) => p.customer.id)).toEqual(before);
  });
});

describe("paginateDirectory", () => {
  const many = Array.from({ length: 60 }, (_, i) => profile({ customer: { id: `c${i}` } }));

  it("cuts a page and describes it", () => {
    const page = paginateDirectory(many, 2);
    expect(page.rows).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(page.total).toBe(60);
    expect(page.pageCount).toBe(3);
    expect(page.from).toBe(26);
    expect(page.to).toBe(50);
    expect(page.rows[0].customer.id).toBe("c25");
  });

  it("clamps a page number that is out of range", () => {
    expect(paginateDirectory(many, 99).page).toBe(3);
    expect(paginateDirectory(many, 0).page).toBe(1);
    expect(paginateDirectory(many, -4).page).toBe(1);
    expect(paginateDirectory(many, 3).rows).toHaveLength(10);
  });

  it("reports an empty book without a negative range", () => {
    const page = paginateDirectory([], 1);
    expect(page.rows).toEqual([]);
    expect(page.pageCount).toBe(1);
    expect(page.from).toBe(0);
    expect(page.to).toBe(0);
  });
});

describe("queryDirectory", () => {
  it("filters, sorts and pages in that order", () => {
    const page = queryDirectory(BOOK, { sort: "spend", direction: "desc", pageSize: 1 });
    expect(page.total).toBe(3);
    expect(page.rows.map((p) => p.customer.id)).toEqual(["vip"]);
    expect(page.pageCount).toBe(3);
  });
});

describe("the URL is the directory", () => {
  it("carries search, band, sort, page and every rule", () => {
    const state = {
      ...DEFAULT_DIRECTORY_STATE,
      q: "priya",
      health: "dues" as const,
      sort: "spend" as const,
      direction: "desc" as const,
      page: 2,
      rules: {
        minOrders: 3,
        tags: ["trade", "designer"],
        source: "Referral",
        hasOutstandingDues: true,
        hasOpenComplaints: false,
      },
    };
    const params = directoryToParams(state);
    expect(params).toEqual({
      q: "priya",
      health: "dues",
      sort: "spend",
      dir: "desc",
      page: "2",
      minOrders: "3",
      tags: "trade|designer",
      source: "Referral",
      hasOutstandingDues: "yes",
      hasOpenComplaints: "no",
    });
    const restored = directoryFromParams(params, ["trade", "designer", "regular"]);
    expect(restored.q).toBe("priya");
    expect(restored.health).toBe("dues");
    expect(restored.sort).toBe("spend");
    expect(restored.direction).toBe("desc");
    expect(restored.page).toBe(2);
    expect(restored.rules).toEqual(state.rules);
  });

  it("keeps a default view to an empty query string", () => {
    expect(directoryToParams(DEFAULT_DIRECTORY_STATE)).toEqual({});
  });

  it("ignores junk in the address bar instead of crashing the page", () => {
    const state = directoryFromParams({
      health: "banana",
      sort: "everything",
      page: "-3",
      size: "999999",
      minOrders: "abc",
      tags: "trade|ghost",
      priceTier: "gold",
    }, ["trade"]);
    expect(state.health).toBe("all");
    expect(state.sort).toBe("name");
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(200);
    expect(state.rules).toEqual({ tags: ["trade"] });
  });

  it("never lets a hostile page size pull the whole book", () => {
    expect(directoryFromParams({ size: "100000" }).pageSize).toBe(200);
    expect(directoryFromParams({ size: "0" }).pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("falls back to the default page size when the link omits it", () => {
    expect(directoryFromParams({}).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(directoryFromParams({}).memberIds).toBeNull();
  });
});

describe("findDuplicates", () => {
  it("catches the same number written two ways", () => {
    const rows = [
      profile({ customer: { id: "a", name: "Tejas Panchal", phone: "+91 98250 11111" } }),
      profile({ customer: { id: "b", name: "T Panchal", phone: "09825011111" } }),
    ];
    const matches = findDuplicates(rows);
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe("high");
    expect(matches[0].reason).toMatch(/phone/i);
  });

  it("counts a matching phone and name as the strongest signal", () => {
    const rows = [
      profile({ customer: { id: "a", name: "Anjali Shah", phone: "9825011111", email: null } }),
      profile({ customer: { id: "b", name: "anjali shah", phone: "+91 98250 11111", email: null } }),
    ];
    expect(findDuplicates(rows)[0].reason).toBe("Same phone and name");
  });

  it("matches an email whatever the case", () => {
    const rows = [
      profile({ customer: { id: "a", email: "Anjali@Example.in", phone: null } }),
      profile({ customer: { id: "b", email: "anjali@example.in", phone: null } }),
    ];
    expect(findDuplicates(rows)[0].reason).toBe("Same email address");
  });

  it("only asks for a look when the name is the single thing in common", () => {
    const rows = [
      profile({ customer: { id: "a", name: "Ravi Kumar", phone: "+91 90000 00001", email: null } }),
      profile({ customer: { id: "b", name: "Ravi Kumar", phone: "+91 90000 00002", email: null } }),
    ];
    const matches = findDuplicates(rows);
    expect(matches[0].confidence).toBe("review");
    expect(matches[0].reason).toMatch(/check before merging/i);
  });

  it("leaves genuinely different customers alone", () => {
    const rows = [
      profile({ customer: { id: "a", name: "Asha", phone: "+91 90000 00001", email: "a@x.in" } }),
      profile({ customer: { id: "b", name: "Bina", phone: "+91 90000 00002", email: "b@x.in" } }),
    ];
    expect(findDuplicates(rows)).toEqual([]);
  });

  it("will not call two phone-less rows duplicates of each other", () => {
    const rows = [
      profile({ customer: { id: "a", name: "A", phone: null, email: null } }),
      profile({ customer: { id: "b", name: "B", phone: null, email: null } }),
    ];
    expect(findDuplicates(rows)).toEqual([]);
  });

  it("needs ten digits before trusting a number", () => {
    const rows = [
      profile({ customer: { id: "a", name: "A", phone: "12345", email: null } }),
      profile({ customer: { id: "b", name: "B", phone: "12345", email: null } }),
    ];
    expect(findDuplicates(rows)).toEqual([]);
  });

  it("puts the certain merges before the ones to check", () => {
    const rows = [
      profile({ customer: { id: "x", name: "Ravi Kumar", phone: "+91 90000 11111", email: null } }),
      profile({ customer: { id: "y", name: "Someone Else", phone: "+91 90000 11111", email: null } }),
      profile({ customer: { id: "z", name: "Ravi Kumar", phone: "+91 90000 22222", email: null } }),
    ];
    expect(findDuplicates(rows).map((m) => [m.a.customer.id, m.b.customer.id])).toEqual([
      ["x", "y"],
      ["x", "z"],
    ]);
  });
});

describe("the directory export", () => {
  it("writes one column per header", () => {
    const rows = customersToCsvRows(BOOK);
    expect(rows).toHaveLength(BOOK.length);
    for (const row of rows) {
      expect(row).toHaveLength(CUSTOMER_CSV_HEADERS.length);
    }
  });

  it("keeps derived money out of a file that can be re-imported", () => {
    expect(CUSTOMER_CSV_HEADERS).not.toContain("lifetime_value");
    expect(CUSTOMER_CSV_HEADERS).not.toContain("dues");
    expect(CUSTOMER_CSV_HEADERS).toContain("marketing_consent");
  });

  it("writes consent as words a person can paste back in", () => {
    const [vip] = customersToCsvRows([BOOK[0]]);
    expect(vip[0]).toBe("Priya Homes Interiors");
    expect(vip[5]).toBe("trade|designer");
    expect(vip[9]).toBe("yes");
    expect(vip[10]).toBe("no");
  });
});

describe("daysQuiet", () => {
  it("measures silence in whole days", () => {
    expect(daysQuiet(BOOK[1], NOW)).toBe(96);
  });

  it("says nothing about a customer who has never bought", () => {
    expect(daysQuiet(BOOK[2], NOW)).toBeNull();
  });
});
