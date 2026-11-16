/**
 * The CSV table registry: one entry per `data/*.csv` file.
 *
 * Columns mirror the TypeScript entity shapes (`types/database.ts`,
 * `types/business.ts`, `types/operations.ts`, `types/manager.ts`) one-to-one,
 * so a CSV row is a faithful human-editable picture of the record the app
 * already uses. `brand_id` is the scoping column everywhere it exists: the
 * demo workspaces' brand ids (`demo-brewery-cafe`, `demo-cubig-furniture`) and
 * a live brand's uuid both key the same column.
 *
 * Column kinds decide the cell <-> value mapping:
 *   str     text; blank cell -> ""
 *   strN    nullable text; blank cell -> null
 *   num     number; blank/invalid -> 0
 *   numN    nullable number; blank cell -> null
 *   bool    true/false; blank -> false
 *   json    JSON value; blank cell -> null (decode never refuses)
 *   jsonN   nullable JSON; blank cell -> null — same runtime behaviour; the
 *           split documents intent at the column site
 *
 * `order_items` and `payments` keep `order_id` rather than `brand_id` on the
 * first column list because that is how the entities are shaped; brand scope
 * is resolved through the parent order where needed.
 */

export type ColumnKind =
  | "str"
  | "strN"
  | "num"
  | "numN"
  | "bool"
  | "json"
  | "jsonN";

export type Column = { name: string; kind: ColumnKind };

export const CSV_TABLES = [
  "products",
  "orders",
  "order_items",
  "customers",
  "offers",
  "payments",
  "stock_adjustments",
  "staff",
  "services",
  "service_jobs",
  "appointments",
  "visits",
  "shifts",
  "tasks",
  "notes",
  "expenses",
  "suppliers",
  "purchase_orders",
  "cash_movements",
  "cash_sessions",
  "attendance",
  "leave_requests",
  "external_events",
  "sync_actions",
  "refunds",
  "audit_log",
  "brand_settings",
  "sessions",
  "leads",
  "customer_interactions",
  "customer_reviews",
  "customer_complaints",
  "customer_segments",
  "marketing_campaigns",
  "campaign_recipients",
  "loyalty_accounts",
  "loyalty_transactions",
  "memberships",
  "crm_settings",
] as const;

export type CsvTable = (typeof CSV_TABLES)[number];

const c = (name: string, kind: ColumnKind): Column => ({ name, kind });

const ID = c("id", "str");
const BRAND = c("brand_id", "str");

export const TABLE_SCHEMAS: Record<
  CsvTable,
  { file: string; columns: Column[] }
> = {
  products: {
    file: "products.csv",
    columns: [
      ID,
      BRAND,
      c("name", "str"),
      c("description", "strN"),
      c("sku", "strN"),
      c("category", "strN"),
      c("price", "num"),
      c("cost_price", "numN"),
      c("unit", "strN"),
      c("is_active", "bool"),
      c("default_discount_percent", "numN"),
      c("image_url", "strN"),
      c("stock_qty", "numN"),
      c("low_stock_threshold", "numN"),
      c("wholesale_price", "numN"),
      c("modifiers_json", "jsonN"),
    ],
  },
  orders: {
    file: "orders.csv",
    columns: [
      ID,
      BRAND,
      c("order_number", "str"),
      c("status", "str"),
      c("payment_status", "str"),
      c("customer_id", "strN"),
      c("customer_name_snapshot", "strN"),
      c("subtotal", "num"),
      c("discount_total", "num"),
      c("tax_total", "num"),
      c("fees_total", "num"),
      c("grand_total", "num"),
      c("notes", "strN"),
      c("created_at", "str"),
      c("table_tag", "strN"),
      c("delivery_notes", "strN"),
      c("deposit_percent", "numN"),
      c("amount_paid", "numN"),
      c("offer_code_snapshot", "strN"),
      c("public_token", "strN"),
      c("parent_order_id", "strN"),
      c("order_kind", "strN"),
    ],
  },
  order_items: {
    file: "order_items.csv",
    columns: [
      ID,
      c("order_id", "str"),
      c("product_id", "strN"),
      c("product_name_snapshot", "str"),
      c("quantity", "num"),
      c("unit_price", "num"),
      c("line_discount", "num"),
      c("line_total", "num"),
      c("product_image_url_snapshot", "strN"),
      c("modifier_labels", "strN"),
    ],
  },
  customers: {
    file: "customers.csv",
    columns: [
      ID,
      BRAND,
      c("name", "str"),
      c("email", "strN"),
      c("phone", "strN"),
      c("notes", "strN"),
      c("price_tier", "strN"),
      c("dob", "strN"),
      c("gender", "strN"),
      c("address", "strN"),
      c("source", "strN"),
      c("tags", "json"),
      c("custom_fields", "json"),
      c("status", "strN"),
      c("marketing_consent", "strN"),
      c("opted_out_at", "strN"),
      c("created_at", "strN"),
    ],
  },
  offers: {
    file: "offers.csv",
    columns: [
      ID,
      BRAND,
      c("name", "str"),
      c("code", "strN"),
      c("discount_type", "str"),
      c("discount_value", "num"),
      c("scope", "str"),
      c("scope_value", "strN"),
      c("min_order_amount", "numN"),
      c("max_discount", "numN"),
      c("starts_at", "strN"),
      c("ends_at", "strN"),
      c("is_active", "bool"),
      c("redemption_count", "num"),
      c("usage_limit", "numN"),
    ],
  },
  payments: {
    file: "payments.csv",
    columns: [
      ID,
      BRAND,
      c("order_id", "str"),
      c("amount", "num"),
      c("method", "str"),
      c("status", "str"),
      c("created_at", "str"),
      c("split_label", "strN"),
      c("notes", "strN"),
    ],
  },
  stock_adjustments: {
    file: "stock_adjustments.csv",
    columns: [
      ID,
      BRAND,
      c("product_id", "str"),
      c("delta_qty", "num"),
      c("reason", "str"),
      c("created_at", "str"),
    ],
  },
  staff: {
    file: "staff.csv",
    columns: [
      ID,
      BRAND,
      c("name", "str"),
      c("role", "str"),
      c("phone", "strN"),
      c("email", "strN"),
      c("status", "str"),
      c("availability", "str"),
      c("created_at", "str"),
    ],
  },
  services: {
    file: "services.csv",
    columns: [
      ID,
      BRAND,
      c("name", "str"),
      c("description", "str"),
      c("durationMinutes", "num"),
      c("price", "num"),
      c("isActive", "bool"),
    ],
  },
  service_jobs: {
    file: "service_jobs.csv",
    columns: [
      ID,
      BRAND,
      c("serviceId", "str"),
      c("customerId", "str"),
      c("staffIds", "json"),
      c("status", "str"),
      c("scheduledAt", "strN"),
      c("notes", "str"),
    ],
  },
  appointments: {
    file: "appointments.csv",
    columns: [
      ID,
      BRAND,
      c("title", "str"),
      c("customerId", "strN"),
      c("staffIds", "json"),
      c("startsAt", "str"),
      c("endsAt", "str"),
      c("location", "str"),
      c("serviceId", "strN"),
      c("status", "str"),
      c("notes", "str"),
    ],
  },
  visits: {
    file: "visits.csv",
    columns: [
      ID,
      BRAND,
      c("customerId", "str"),
      c("staffId", "str"),
      c("purpose", "str"),
      c("status", "str"),
      c("checkInAt", "strN"),
      c("checkOutAt", "strN"),
      c("report", "strN"),
    ],
  },
  shifts: {
    file: "shifts.csv",
    columns: [
      ID,
      BRAND,
      c("staffId", "str"),
      c("date", "str"),
      c("start", "str"),
      c("end", "str"),
      c("note", "str"),
    ],
  },
  tasks: {
    file: "tasks.csv",
    columns: [
      ID,
      BRAND,
      c("title", "str"),
      c("description", "str"),
      c("assigneeStaffId", "strN"),
      c("customerId", "strN"),
      c("priority", "str"),
      c("dueAt", "strN"),
      c("status", "str"),
    ],
  },
  notes: {
    file: "notes.csv",
    columns: [
      ID,
      BRAND,
      c("title", "str"),
      c("body", "str"),
      c("category", "str"),
      c("scope", "str"),
      c("pinned", "bool"),
      c("linkedCustomerId", "strN"),
      c("linkedStaffId", "strN"),
      c("linkedAppointmentId", "strN"),
      c("linkedTaskId", "strN"),
      c("created_at", "str"),
      c("updated_at", "str"),
    ],
  },
  expenses: {
    file: "expenses.csv",
    columns: [
      ID,
      BRAND,
      c("title", "str"),
      c("category", "str"),
      c("amount", "num"),
      c("method", "str"),
      c("incurredOn", "str"),
      c("recurring", "str"),
      c("supplierId", "strN"),
      c("notes", "str"),
      c("created_at", "str"),
    ],
  },
  suppliers: {
    file: "suppliers.csv",
    columns: [
      ID,
      BRAND,
      c("name", "str"),
      c("contactName", "strN"),
      c("phone", "strN"),
      c("email", "strN"),
      c("category", "strN"),
      c("leadTimeDays", "numN"),
      c("paymentTerms", "strN"),
      c("notes", "str"),
      c("is_active", "bool"),
      c("created_at", "str"),
    ],
  },
  purchase_orders: {
    file: "purchase_orders.csv",
    columns: [
      ID,
      BRAND,
      c("poNumber", "str"),
      c("supplierId", "strN"),
      c("status", "str"),
      c("expectedOn", "strN"),
      c("createdAt", "str"),
      c("lines", "json"),
      c("notes", "str"),
    ],
  },
  cash_movements: {
    file: "cash_movements.csv",
    columns: [
      ID,
      BRAND,
      c("date", "str"),
      c("direction", "str"),
      c("amount", "num"),
      c("reason", "str"),
      c("method", "str"),
      c("source", "str"),
      c("refId", "strN"),
    ],
  },
  cash_sessions: {
    file: "cash_sessions.csv",
    columns: [
      ID,
      BRAND,
      c("date", "str"),
      c("openingBalance", "num"),
      c("countedBalance", "numN"),
      c("closedAt", "strN"),
      c("staffId", "strN"),
      c("note", "str"),
    ],
  },
  attendance: {
    file: "attendance.csv",
    columns: [
      ID,
      BRAND,
      c("staffId", "str"),
      c("date", "str"),
      c("status", "str"),
      c("checkIn", "strN"),
      c("checkOut", "strN"),
      c("note", "str"),
    ],
  },
  leave_requests: {
    file: "leave_requests.csv",
    columns: [
      ID,
      BRAND,
      c("staffId", "str"),
      c("startsOn", "str"),
      c("endsOn", "str"),
      c("kind", "str"),
      c("status", "str"),
      c("reason", "str"),
      c("createdAt", "str"),
    ],
  },
  external_events: {
    file: "external_events.csv",
    columns: [
      ID,
      BRAND,
      c("source", "str"),
      c("externalId", "str"),
      c("kind", "str"),
      c("title", "str"),
      c("startsAt", "str"),
      c("endsAt", "str"),
      c("location", "strN"),
      c("accountLabel", "strN"),
      c("customerId", "strN"),
      c("attendeeCount", "numN"),
      c("snippet", "strN"),
      c("needsFollowUp", "bool"),
      c("syncedAt", "str"),
    ],
  },
  sync_actions: {
    file: "sync_actions.csv",
    columns: [
      ID,
      BRAND,
      c("integration", "str"),
      c("type", "str"),
      c("summary", "str"),
      c("payload", "json"),
      c("status", "str"),
      c("createdAt", "str"),
      c("confirmedAt", "strN"),
      c("executedAt", "strN"),
      c("error", "strN"),
      c("localRefId", "strN"),
    ],
  },
  leads: {
    file: "leads.csv",
    columns: [
      ID,
      BRAND,
      c("name", "str"),
      c("company", "strN"),
      c("phone", "strN"),
      c("email", "strN"),
      c("source", "strN"),
      c("stage", "str"),
      c("estimated_value", "num"),
      c("assigned_staff_id", "strN"),
      c("next_follow_up_at", "strN"),
      c("notes", "strN"),
      c("lost_reason", "strN"),
      c("customer_id", "strN"),
      c("converted_at", "strN"),
      c("created_at", "str"),
      c("updated_at", "str"),
    ],
  },
  customer_interactions: {
    file: "customer_interactions.csv",
    columns: [
      ID,
      BRAND,
      c("customer_id", "strN"),
      c("lead_id", "strN"),
      c("type", "str"),
      c("subject", "strN"),
      c("description", "str"),
      c("occurred_at", "str"),
      c("staff_id", "strN"),
      c("outcome", "strN"),
      c("next_follow_up_at", "strN"),
      c("attachments", "json"),
      c("task_id", "strN"),
      c("created_at", "str"),
    ],
  },
  customer_reviews: {
    file: "customer_reviews.csv",
    columns: [
      ID,
      BRAND,
      c("source", "str"),
      c("rating", "num"),
      c("text", "str"),
      c("reviewer_name", "strN"),
      c("customer_id", "strN"),
      c("review_date", "str"),
      c("sentiment", "strN"),
      c("tags", "json"),
      c("response_status", "str"),
      c("response_text", "strN"),
      c("responded_at", "strN"),
      c("internal_notes", "strN"),
      c("staff_mentioned", "strN"),
      c("complaint_id", "strN"),
      c("created_at", "str"),
      c("updated_at", "str"),
    ],
  },
  customer_complaints: {
    file: "customer_complaints.csv",
    columns: [
      ID,
      BRAND,
      c("customer_id", "strN"),
      c("lead_id", "strN"),
      c("review_id", "strN"),
      c("interaction_id", "strN"),
      c("subject", "str"),
      c("description", "strN"),
      c("severity", "str"),
      c("status", "str"),
      c("assigned_staff_id", "strN"),
      c("resolution_notes", "strN"),
      c("opened_at", "str"),
      c("resolved_at", "strN"),
      c("created_at", "str"),
      c("updated_at", "str"),
    ],
  },
  customer_segments: {
    file: "customer_segments.csv",
    columns: [
      ID,
      BRAND,
      c("name", "str"),
      c("description", "strN"),
      c("kind", "str"),
      c("rules", "json"),
      c("manual_customer_ids", "json"),
      c("created_at", "str"),
      c("updated_at", "str"),
    ],
  },
  marketing_campaigns: {
    file: "marketing_campaigns.csv",
    columns: [
      ID,
      BRAND,
      c("name", "str"),
      c("description", "strN"),
      c("type", "str"),
      c("channel", "str"),
      c("segment_id", "strN"),
      c("offer_id", "strN"),
      c("status", "str"),
      c("start_date", "str"),
      c("end_date", "strN"),
      c("consent_only", "bool"),
      c("targeted_count", "num"),
      c("marked_sent_count", "num"),
      c("response_count", "num"),
      c("redemption_count", "num"),
      c("revenue_attributed", "num"),
      c("created_at", "str"),
      c("updated_at", "str"),
    ],
  },
  campaign_recipients: {
    file: "campaign_recipients.csv",
    columns: [
      ID,
      BRAND,
      c("campaign_id", "str"),
      c("customer_id", "strN"),
      c("lead_id", "strN"),
      c("status", "str"),
      c("marked_sent_at", "strN"),
      c("responded_at", "strN"),
      c("redeemed_at", "strN"),
      c("order_id", "strN"),
      c("note", "strN"),
      c("created_at", "str"),
      c("updated_at", "str"),
    ],
  },
  loyalty_accounts: {
    file: "loyalty_accounts.csv",
    columns: [
      ID,
      BRAND,
      c("customer_id", "str"),
      c("points_balance", "num"),
      c("lifetime_points", "num"),
      c("tier", "strN"),
      c("last_activity_at", "strN"),
      c("created_at", "str"),
      c("updated_at", "str"),
    ],
  },
  loyalty_transactions: {
    file: "loyalty_transactions.csv",
    columns: [
      ID,
      BRAND,
      c("account_id", "str"),
      c("customer_id", "str"),
      c("kind", "str"),
      c("points", "num"),
      c("balance_after", "num"),
      c("reason", "strN"),
      c("order_id", "strN"),
      c("expires_at", "strN"),
      c("created_at", "str"),
    ],
  },
  memberships: {
    file: "memberships.csv",
    columns: [
      ID,
      BRAND,
      c("customer_id", "str"),
      c("plan", "str"),
      c("status", "str"),
      c("started_at", "str"),
      c("ends_at", "strN"),
      c("auto_renew", "bool"),
      c("benefits", "json"),
      c("price", "num"),
      c("created_at", "str"),
      c("updated_at", "str"),
    ],
  },
  crm_settings: {
    file: "crm_settings.csv",
    columns: [
      ID,
      BRAND,
      c("loyalty", "json"),
      c("lead_sources", "json"),
      c("review_sources", "json"),
      c("updated_at", "str"),
    ],
  },
  refunds: {
    file: "refunds.csv",
    columns: [
      ID,
      BRAND,
      c("order_id", "str"),
      c("payment_id", "strN"),
      c("amount", "num"),
      c("reason", "strN"),
      c("created_at", "str"),
    ],
  },
  audit_log: {
    file: "audit_log.csv",
    columns: [
      ID,
      BRAND,
      c("actor_email", "strN"),
      c("action", "str"),
      c("entity_type", "str"),
      c("entity_id", "strN"),
      c("detail", "strN"),
      c("created_at", "str"),
    ],
  },
  /**
   * One row per brand: exactly the workspace settings the `/settings` screen
   * edits, which is also everything the old `ob_workspace_prefs` cookie held.
   *
   * Presence rule, stated once: **no row means "the fixtures decide"** (the
   * pack's `settings` + the industry profile). The first save creates the row
   * pre-filled from those effective values, so every later cell is a real
   * answer rather than a blank that a reader would have to guess about —
   * `saveBrandSettingsRow` in `src/lib/workspace/prefs.ts` owns that rule.
   */
  brand_settings: {
    file: "brand_settings.csv",
    columns: [
      ID,
      BRAND,
      c("receipt_header", "strN"),
      c("receipt_footer", "strN"),
      c("contact_email", "strN"),
      c("contact_phone", "strN"),
      c("quotation_builder_enabled", "bool"),
      c("brand_website_url", "strN"),
      c("industry", "strN"),
      c("hidden_manager_modules", "jsonN"),
      c("integrations", "jsonN"),
      c("ai_automations", "jsonN"),
      c("ai_proposals", "jsonN"),
      c("updated_at", "str"),
    ],
  },
  /* Login state, not business data: one live row per signed-in demo brand.
     `token_hash` is the SHA-256 of the token the browser holds — the token
     itself is never stored, so this file cannot be used to sign in. See
     `src/lib/csv/session-store.ts`. */
  sessions: {
    file: "sessions.csv",
    columns: [
      ID,
      BRAND,
      c("token_hash", "str"),
      c("created_at", "str"),
      c("expires_at", "str"),
    ],
  },
};

export function encodeCell(kind: ColumnKind, value: unknown): string {
  switch (kind) {
    case "bool":
      return value ? "true" : "false";
    case "num":
    case "numN":
      return value === null || value === undefined ? "" : String(value);
    case "json":
    case "jsonN":
      return value === null || value === undefined
        ? ""
        : JSON.stringify(value);
    case "str":
    case "strN":
      return value === null || value === undefined ? "" : String(value);
  }
}

export function decodeCell(kind: ColumnKind, cell: string): unknown {
  switch (kind) {
    case "bool":
      return cell === "true" || cell === "1";
    case "num": {
      const n = Number(cell);
      return cell === "" || Number.isNaN(n) ? 0 : n;
    }
    case "numN": {
      if (cell === "") return null;
      const n = Number(cell);
      return Number.isNaN(n) ? null : n;
    }
    case "json": {
      if (cell === "") return null;
      try {
        return JSON.parse(cell);
      } catch {
        return null;
      }
    }
    case "jsonN": {
      if (cell === "") return null;
      try {
        return JSON.parse(cell);
      } catch {
        return null;
      }
    }
    case "str":
      return cell;
    case "strN":
      return cell === "" ? null : cell;
  }
}

export function encodeRow(
  table: CsvTable,
  row: Record<string, unknown>,
): string[] {
  return TABLE_SCHEMAS[table].columns.map((col) =>
    encodeCell(col.kind, row[col.name] ?? null),
  );
}

export function decodeRow(
  table: CsvTable,
  cells: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const columns = TABLE_SCHEMAS[table].columns;
  for (let i = 0; i < columns.length; i++) {
    out[columns[i].name] = decodeCell(columns[i].kind, cells[i] ?? "");
  }
  return out;
}

export function headerRow(table: CsvTable): string[] {
  return TABLE_SCHEMAS[table].columns.map((col) => col.name);
}
