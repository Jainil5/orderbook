import { parseCsvObjects } from "@/lib/demo/csv/parse-csv";
import type { Customer, CustomerStatus } from "@/types/database";
import type { SegmentRules } from "@/types/crm";
import { isAtRisk, isDormant, type CustomerProfile } from "./metrics";
import { rulesToMatcher } from "./segments";

/**
 * The customer directory's search, filter, sort and page math, plus the
 * duplicate detector the "merge" prompt reads.
 *
 * Filters are expressed as the same `SegmentRules` object a saved segment
 * stores, so "filter the list" and "save this as a segment" are one feature
 * rather than two that have to agree.
 */

export const HEALTH_FILTERS = [
  "all",
  "active",
  "at_risk",
  "dormant",
  "new",
  "birthdays",
  "dues",
  "complaints",
] as const;
export type HealthFilter = (typeof HEALTH_FILTERS)[number];

export const HEALTH_FILTER_LABELS: Record<HealthFilter, string> = {
  all: "Everyone",
  active: "Active",
  at_risk: "At risk",
  dormant: "Dormant",
  new: "New this month",
  birthdays: "Birthdays this month",
  dues: "Owing money",
  complaints: "Open complaints",
};

export const SORT_KEYS = [
  "name",
  "spend",
  "orders",
  "last_order",
  "joined",
  "due",
  "rating",
  "points",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  spend: "Lifetime spend",
  orders: "Bills",
  last_order: "Last purchase",
  joined: "Date added",
  due: "Outstanding",
  rating: "Average rating",
  points: "Loyalty points",
};

export const DEFAULT_PAGE_SIZE = 25;

export type DirectoryState = {
  q: string;
  health: HealthFilter;
  rules: SegmentRules;
  /** Membership of a saved segment, resolved by the caller. */
  memberIds: Set<string> | null;
  sort: SortKey;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const DEFAULT_DIRECTORY_STATE: DirectoryState = {
  q: "",
  health: "all",
  rules: {},
  memberIds: null,
  sort: "name",
  direction: "asc",
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

const DAY_MS = 86400000;

function birthdayThisMonth(profile: CustomerProfile, now: Date): boolean {
  const dob = profile.customer.date_of_birth;
  if (!dob) return false;
  return Number(dob.slice(5, 7)) === now.getMonth() + 1;
}

function matchesHealth(
  profile: CustomerProfile,
  health: HealthFilter,
  now: Date,
): boolean {
  switch (health) {
    case "all":
      return true;
    case "active":
      return profile.status === "active";
    case "at_risk":
      return isAtRisk(profile);
    case "dormant":
      return isDormant(profile);
    case "new":
      return profile.daysSinceJoin <= 30;
    case "birthdays":
      return birthdayThisMonth(profile, now);
    case "dues":
      return profile.dues > 0;
    case "complaints":
      return profile.openComplaints > 0;
  }
}

/** Free text across everything a shopkeeper would actually type. */
export function matchesQuery(profile: CustomerProfile, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const c = profile.customer;
  const phone = (c.phone ?? "").replace(/\D/g, "");
  const haystack = [
    c.name,
    c.email ?? "",
    c.phone ?? "",
    phone,
    phone.slice(-4),
    c.address ?? "",
    c.source ?? "",
    ...profile.tags,
    ...Object.values(c.custom_fields ?? {}),
  ]
    .join(" ")
    .toLowerCase();
  return needle
    .split(/\s+/)
    .every((token) => haystack.includes(token));
}

export function filterDirectory(
  profiles: CustomerProfile[],
  state: DirectoryState,
  now: Date = new Date(),
): CustomerProfile[] {
  const matchesRules = Object.keys(state.rules).length ? rulesToMatcher(state.rules) : null;
  return profiles.filter((p) => {
    if (state.memberIds && !state.memberIds.has(p.customer.id)) return false;
    if (!matchesHealth(p, state.health, now)) return false;
    if (matchesRules && !matchesRules(p)) return false;
    return matchesQuery(p, state.q);
  });
}

function sortValue(profile: CustomerProfile, key: SortKey): number | string {
  switch (key) {
    case "name":
      return profile.customer.name.toLowerCase();
    case "spend":
      return profile.lifetimeValue;
    case "orders":
      return profile.orders;
    case "last_order":
      return profile.lastOrderAt ? new Date(profile.lastOrderAt).getTime() : 0;
    case "joined":
      return new Date(profile.joinedAt).getTime();
    case "due":
      return profile.dues;
    case "rating":
      return profile.avgRating ?? 0;
    case "points":
      return profile.loyaltyPoints;
  }
}

export function sortDirectory(
  profiles: CustomerProfile[],
  key: SortKey,
  direction: "asc" | "desc" = "asc",
): CustomerProfile[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...profiles].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (typeof av === "string" || typeof bv === "string") {
      return sign * String(av).localeCompare(String(bv));
    }
    return sign * (av - bv);
  });
}

export type DirectoryPage = {
  rows: CustomerProfile[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** Inclusive 1-based range shown in the "1–25 of 60" caption. */
  from: number;
  to: number;
};

export function paginateDirectory(
  profiles: CustomerProfile[],
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): DirectoryPage {
  const size = Math.max(1, Math.round(pageSize));
  const pageCount = Math.max(1, Math.ceil(profiles.length / size));
  const current = Math.min(Math.max(1, Math.round(page)), pageCount);
  const start = (current - 1) * size;
  const rows = profiles.slice(start, start + size);
  return {
    rows,
    total: profiles.length,
    page: current,
    pageCount,
    pageSize: size,
    from: profiles.length ? start + 1 : 0,
    to: start + rows.length,
  };
}

/** Filter → sort → paginate in the order the directory always applies them. */
export function queryDirectory(
  profiles: CustomerProfile[],
  state: Partial<DirectoryState> = {},
  now: Date = new Date(),
): DirectoryPage {
  const merged: DirectoryState = { ...DEFAULT_DIRECTORY_STATE, ...state };
  const filtered = filterDirectory(profiles, merged, now);
  const sorted = sortDirectory(filtered, merged.sort, merged.direction);
  return paginateDirectory(sorted, merged.page, merged.pageSize);
}

/**
 * The URL is the directory state, so a filtered view is linkable and survives a
 * refresh — and "save this as a segment" has something to save.
 */
export function directoryToParams(state: DirectoryState): Record<string, string> {
  const params: Record<string, string> = {};
  if (state.q) params.q = state.q;
  if (state.health !== "all") params.health = state.health;
  if (state.sort !== "name") params.sort = state.sort;
  if (state.direction !== "asc") params.dir = state.direction;
  if (state.page > 1) params.page = String(state.page);
  if (state.pageSize !== DEFAULT_PAGE_SIZE) params.size = String(state.pageSize);
  for (const [key, value] of Object.entries(state.rules)) {
    if (value === undefined || value === null || value === "") continue;
    // Booleans round-trip as `yes`/`no`, which is what the reader understands.
    if (typeof value === "boolean") {
      params[key] = value ? "yes" : "no";
      continue;
    }
    params[key] = Array.isArray(value) ? value.join("|") : String(value);
  }
  return params;
}

function toInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

/** Rule fields are the only query params that are not directory chrome. */
export function directoryFromParams(
  params: Record<string, string | string[] | undefined>,
  knownTags: string[] = [],
): DirectoryState {
  const read = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  const rules: SegmentRules = {};
  const numeric: (keyof SegmentRules)[] = [
    "minOrders",
    "maxOrders",
    "minSpend",
    "maxSpend",
    "inactiveDays",
    "activeWithinDays",
    "joinedWithinDays",
    "minRating",
    "maxRating",
    "minLoyaltyPoints",
  ];
  for (const key of numeric) {
    const n = toInt(read(key));
    if (n !== undefined) (rules as Record<string, number>)[key] = n;
  }
  const tags = read("tags");
  if (tags) {
    const list = tags.split("|").map((t) => t.trim()).filter(Boolean);
    // Unknown tags would silently match nobody; drop them instead.
    const usable = knownTags.length ? list.filter((t) => knownTags.includes(t)) : list;
    if (usable.length) rules.tags = usable;
  }
  const source = read("source");
  if (source) rules.source = source;
  const priceTier = read("priceTier");
  if (priceTier === "retail" || priceTier === "wholesale") rules.priceTier = priceTier;
  if (read("hasOpenComplaints") === "yes") rules.hasOpenComplaints = true;
  if (read("hasOpenComplaints") === "no") rules.hasOpenComplaints = false;
  if (read("hasOutstandingDues") === "yes") rules.hasOutstandingDues = true;
  if (read("hasOutstandingDues") === "no") rules.hasOutstandingDues = false;
  const loyaltyTier = read("loyaltyTier");
  if (loyaltyTier) rules.loyaltyTier = loyaltyTier;

  const health = read("health");
  const sort = read("sort");
  const page = toInt(read("page"));
  const pageSize = toInt(read("size"));
  return {
    q: read("q") ?? "",
    health: HEALTH_FILTERS.includes(health as HealthFilter)
      ? (health as HealthFilter)
      : "all",
    rules,
    memberIds: null,
    sort: SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : "name",
    direction: read("dir") === "desc" ? "desc" : "asc",
    page: page && page > 0 ? page : 1,
    pageSize: pageSize && pageSize > 0 ? Math.min(pageSize, 200) : DEFAULT_PAGE_SIZE,
  };
}

export type DuplicateMatch = {
  a: CustomerProfile;
  b: CustomerProfile;
  reason: string;
  /** `phone`/`email` are near-certain; `name` alone is only a prompt to check. */
  confidence: "high" | "review";
};

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Last ten digits, so a leading +91 / 0 difference stops hiding duplicates. */
function phoneKey(value: string | null | undefined): string {
  const d = digits(value);
  return d.length >= 10 ? d.slice(-10) : d;
}

function nameKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function emailKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Every pair that looks like the same person, strongest matches first. The
 * demo never auto-merges: billing rows reference customer ids, so a merge is a
 * decision only the shopkeeper can make.
 */
export function findDuplicates(profiles: CustomerProfile[]): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const a = profiles[i];
      const b = profiles[j];
      const phone = phoneKey(a.customer.phone);
      const samePhone = phone.length >= 10 && phone === phoneKey(b.customer.phone);
      const email = emailKey(a.customer.email);
      const sameEmail = email.length > 0 && email === emailKey(b.customer.email);
      const sameName = nameKey(a.customer.name) === nameKey(b.customer.name);
      if (samePhone && sameName) {
        matches.push({ a, b, reason: "Same phone and name", confidence: "high" });
      } else if (samePhone) {
        matches.push({ a, b, reason: "Same phone number", confidence: "high" });
      } else if (sameEmail) {
        matches.push({ a, b, reason: "Same email address", confidence: "high" });
      } else if (sameName) {
        matches.push({
          a,
          b,
          reason: "Same name — check before merging",
          confidence: "review",
        });
      }
    }
  }
  return matches.sort((x, y) => (x.confidence === y.confidence ? 0 : x.confidence === "high" ? -1 : 1));
}

export const CUSTOMER_CSV_HEADERS = [
  "name",
  "email",
  "phone",
  "status",
  "source",
  "tags",
  "address",
  "date_of_birth",
  "price_tier",
  "marketing_consent",
  "opted_out",
  "notes",
  "created_at",
] as const;

/** Import columns only — the money columns are derived, so they stay out. */
export function customersToCsvRows(profiles: CustomerProfile[]): (string | number | null)[][] {
  return profiles.map((p) => {
    const c = p.customer;
    return [
      c.name,
      c.email ?? "",
      c.phone ?? "",
      p.status,
      c.source ?? "",
      (c.tags ?? []).join("|"),
      c.address ?? "",
      c.date_of_birth ?? "",
      p.priceTier,
      c.marketing_consent ? "yes" : "no",
      c.opted_out ? "yes" : "no",
      c.notes ?? "",
      c.created_at ?? "",
    ];
  });
}

/** Days a row has been silent — the win-back campaigns sort on this. */
export function daysQuiet(profile: CustomerProfile, now: Date = new Date()): number | null {
  if (!profile.lastOrderAt) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(profile.lastOrderAt).getTime()) / DAY_MS));
}

/**
 * The CRM half of a customer record. Billing already owns name, phone and
 * email on its own editor, so this form only writes the relationship fields —
 * which is why consent arrives as a checkbox rather than a default.
 */
export type CustomerCrmInput = {
  status: string;
  source: string;
  price_tier: string;
  tags: string;
  address: string;
  date_of_birth: string;
  gender: string;
  marketing_consent: string;
  opted_out: string;
  notes: string;
  custom_fields: string;
};

export const EMPTY_CUSTOMER_CRM_INPUT: CustomerCrmInput = {
  status: "active",
  source: "",
  price_tier: "retail",
  tags: "",
  address: "",
  date_of_birth: "",
  gender: "",
  marketing_consent: "no",
  opted_out: "no",
  notes: "",
  custom_fields: "",
};

const CUSTOMER_STATUSES: readonly CustomerStatus[] = ["active", "inactive", "archived"];
const GENDERS: readonly NonNullable<Customer["gender"]>[] = ["male", "female", "other"];

/** Free-form fields a brand keeps on a customer, capped so the record stays readable. */
export const MAX_CUSTOM_FIELDS = 12;

function parseCustomFields(raw: string):
  | { value: Record<string, string> | null; error: null }
  | { value: null; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { value: null, error: "Custom fields have to be a JSON object." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { value: null, error: "Custom fields have to be a JSON object." };
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > MAX_CUSTOM_FIELDS) {
    return { value: null, error: `Keep custom fields to ${MAX_CUSTOM_FIELDS} or fewer.` };
  }
  const value: Record<string, string> = {};
  for (const [key, item] of entries) {
    if (typeof item !== "string" && typeof item !== "number") {
      return { value: null, error: `Custom field "${key}" has to be text or a number.` };
    }
    value[key.trim().slice(0, 40)] = String(item).slice(0, 200);
  }
  return { value, error: null };
}

export function customerCrmInputFromCustomer(customer: Customer): CustomerCrmInput {
  return {
    status: customer.status ?? "active",
    source: customer.source ?? "",
    price_tier: customer.price_tier ?? "retail",
    tags: (customer.tags ?? []).join(", "),
    address: customer.address ?? "",
    date_of_birth: customer.date_of_birth ?? "",
    gender: customer.gender ?? "",
    marketing_consent: customer.marketing_consent ? "yes" : "no",
    opted_out: customer.opted_out ? "yes" : "no",
    notes: customer.notes ?? "",
    custom_fields: customer.custom_fields
      ? JSON.stringify(customer.custom_fields, null, 2)
      : "",
  };
}

export type CustomerCrmValues = Pick<
  Customer,
  | "status"
  | "source"
  | "price_tier"
  | "tags"
  | "address"
  | "date_of_birth"
  | "gender"
  | "marketing_consent"
  | "opted_out"
  | "notes"
  | "custom_fields"
>;

export function validateCustomerCrmInput(
  input: CustomerCrmInput,
  now: Date = new Date(),
): { ok: true; value: CustomerCrmValues } | { ok: false; message: string } {
  if (!CUSTOMER_STATUSES.includes(input.status as CustomerStatus)) {
    return { ok: false, message: "Pick a customer status." };
  }
  const dob = input.date_of_birth.trim();
  if (dob) {
    const parsed = new Date(dob);
    if (Number.isNaN(parsed.getTime()) || parsed > now) {
      return { ok: false, message: "That birthday doesn't look right." };
    }
  }
  const gender = input.gender.trim();
  if (gender && !GENDERS.includes(gender as NonNullable<Customer["gender"]>)) {
    return { ok: false, message: "Pick a recorded gender value, or leave it blank." };
  }
  const custom = parseCustomFields(input.custom_fields);
  if (custom.error) return { ok: false, message: custom.error };
  const tags = input.tags
    .split(/[,\n|]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
  return {
    ok: true,
    value: {
      status: input.status as CustomerStatus,
      source: input.source.trim().slice(0, 60) || null,
      price_tier: input.price_tier === "wholesale" ? "wholesale" : "retail",
      tags,
      address: input.address.trim().slice(0, 240) || null,
      date_of_birth: dob || null,
      gender: (gender as NonNullable<Customer["gender"]>) || null,
      marketing_consent: input.marketing_consent === "yes",
      // Opting out is a fact about the person; it always beats a consent flag.
      opted_out: input.opted_out === "yes",
      notes: input.notes.trim().slice(0, 500) || null,
      custom_fields: custom.value,
    },
  };
}

/**
 * CSV import. A spreadsheet is a contact list, not a marketing permission, so
 * consent stays off unless the file says yes row by row, and a row that matches
 * somebody already on file is reported rather than duplicated.
 */
export type ImportedCustomer = CustomerCrmValues & {
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
};

export const MAX_IMPORT_ROWS = 500;

const yes = (value: string | undefined) =>
  value !== undefined && /^(yes|true|1|y)$/i.test(value.trim());

export function parseCustomerCsv(
  text: string,
  now: Date = new Date(),
): { rows: ImportedCustomer[]; errors: string[] } {
  const errors: string[] = [];
  let records: Record<string, string>[];
  try {
    records = parseCsvObjects(text, "customer import");
  } catch (error) {
    return { rows: [], errors: [error instanceof Error ? error.message : "That file isn't readable CSV."] };
  }
  if (!records.length) return { rows: [], errors: ["The file has no data rows."] };
  if (records.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [`Keep imports to ${MAX_IMPORT_ROWS} rows or fewer — this file has ${records.length}.`],
    };
  }
  const rows: ImportedCustomer[] = [];
  records.forEach((record, index) => {
    const line = index + 2; // header is line 1
    const name = (record.name ?? "").trim().slice(0, 120);
    if (!name) {
      errors.push(`Line ${line}: no name.`);
      return;
    }
    const email = (record.email ?? "").trim().toLowerCase().slice(0, 120) || null;
    const phone = (record.phone ?? "").trim().slice(0, 40) || null;
    if (!email && !phone) {
      errors.push(`Line ${line}: ${name} has neither an email nor a phone.`);
      return;
    }
    const crm = validateCustomerCrmInput(
      {
        ...EMPTY_CUSTOMER_CRM_INPUT,
        status: record.status?.trim() || "active",
        source: record.source ?? "",
        price_tier: record.price_tier ?? "",
        tags: record.tags ?? "",
        address: record.address ?? "",
        date_of_birth: record.date_of_birth ?? "",
        gender: record.gender ?? "",
        marketing_consent: yes(record.marketing_consent) ? "yes" : "no",
        opted_out: yes(record.opted_out) ? "yes" : "no",
        notes: record.notes ?? "",
        custom_fields: record.custom_fields ?? "",
      },
      now,
    );
    if (!crm.ok) {
      errors.push(`Line ${line}: ${crm.message}`);
      return;
    }
    const created = (record.created_at ?? "").trim();
    const createdDate = created ? new Date(created) : now;
    rows.push({
      name,
      email,
      phone,
      created_at: Number.isNaN(createdDate.getTime()) ? now.toISOString() : createdDate.toISOString(),
      ...crm.value,
    });
  });
  return { rows, errors };
}

/** The on-file row an imported line would collide with, if any. */
export function findImportTarget(
  row: Pick<ImportedCustomer, "email" | "phone">,
  profiles: CustomerProfile[],
): CustomerProfile | null {
  const digits = (value: string | null) => (value ?? "").replace(/\D/g, "").slice(-10);
  const phone = digits(row.phone);
  const email = (row.email ?? "").trim().toLowerCase();
  for (const profile of profiles) {
    if (phone.length >= 10 && digits(profile.customer.phone) === phone) return profile;
    const theirs = (profile.customer.email ?? "").trim().toLowerCase();
    if (email && theirs === email) return profile;
  }
  return null;
}
