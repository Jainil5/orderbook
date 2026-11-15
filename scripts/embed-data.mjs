/*
 * Ports the frozen demo seed pack (data/demo/BR-1 and BR-2 CSVs) and the
 * product photos it references into the drop-in ecosites folder, as typed
 * TypeScript.
 *
 * The numbers a visitor sees in the hosted demo are the numbers the real app
 * computes from the same rows, so the two cannot drift apart except on purpose.
 * Dates stay as they are in the CSV — the demo rebases them at runtime, the
 * same way src/lib/demo/csv/rebase.ts does on every server read.
 *
 * Usage: node scripts/embed-data.mjs [outputDirectory]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import sharp from "sharp";

const OUT =
  process.argv[2] ?? "D:/development/ecosites/app/(sites)/orderbook-demo";
const DATA = "data/demo";
const PUBLIC = "public";

const BRANDS = [
  { code: "BR-1", slug: "brewery-cafe", const: "breweryCafePack" },
  { code: "BR-2", slug: "cubig-furniture", const: "cubigFurniturePack" },
];

/* Same grammar as src/lib/demo/csv/parse-csv.ts, kept local so this script has
   no build step of its own. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function rowsFor(code, name) {
  const rows = parseCsv(readFileSync(join(DATA, code, `${name}.csv`), "utf8"));
  const head = rows[0];
  return rows.slice(1).map((cells) => {
    if (cells.length !== head.length) {
      throw new Error(`${code}/${name}: ${cells.length} cells, expected ${head.length}`);
    }
    return Object.fromEntries(head.map((k, i) => [k, cells[i]]));
  });
}

const str = (v) => (v === "" ? null : v);
const num = (v) => (v === "" ? null : Number(v));
const bool = (v) => v === "true";
const json = (v) => (v === "" ? null : JSON.parse(v));

function pack(code) {
  const one = (name) => rowsFor(code, name)[0];
  const many = (name, map) => rowsFor(code, name).map(map);
  const brand = one("brand");
  const s = one("brand_settings");
  return {
    brand: {
      id: brand.id,
      code: brand.code,
      name: brand.name,
    },
    orderNumberPrefix: brand.order_number_prefix,
    settings: {
      brand_id: s.brand_id,
      currency_code: s.currency_code,
      tax_rate_percent: num(s.tax_rate_percent),
      receipt_header: str(s.receipt_header),
      receipt_footer: str(s.receipt_footer),
      contact_email: str(s.contact_email),
      contact_phone: str(s.contact_phone),
      quotation_builder_enabled: s.quotation_builder_enabled === "" ? null : bool(s.quotation_builder_enabled),
      brand_website_url: str(s.brand_website_url),
      block_oversell: s.block_oversell === "" ? null : bool(s.block_oversell),
    },
    products: many("products", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      name: r.name,
      description: str(r.description),
      sku: str(r.sku),
      category: str(r.category),
      price: num(r.price),
      cost_price: num(r.cost_price),
      unit: str(r.unit),
      is_active: bool(r.is_active),
      default_discount_percent: num(r.default_discount_percent),
      image_url: str(r.image_url),
      stock_qty: num(r.stock_qty),
      low_stock_threshold: num(r.low_stock_threshold),
      wholesale_price: num(r.wholesale_price),
      modifiers_json: json(r.modifiers_json),
      unavailable: r.unavailable === "" ? null : bool(r.unavailable),
    })),
    customers: many("customers", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      name: r.name,
      email: str(r.email),
      phone: str(r.phone),
      notes: str(r.notes),
      price_tier: str(r.price_tier),
    })),
    orders: many("orders", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      order_number: r.order_number,
      status: r.status,
      payment_status: r.payment_status,
      customer_id: str(r.customer_id),
      customer_name_snapshot: str(r.customer_name_snapshot),
      subtotal: num(r.subtotal),
      discount_total: num(r.discount_total),
      tax_total: num(r.tax_total),
      fees_total: num(r.fees_total),
      grand_total: num(r.grand_total),
      notes: str(r.notes),
      created_at: r.created_at,
      table_tag: str(r.table_tag),
      delivery_notes: str(r.delivery_notes),
      order_type: str(r.order_type),
      service_date: str(r.service_date),
      guests: num(r.guests),
      delivery_address: str(r.delivery_address),
      payment_method: str(r.payment_method),
      payment_reference: str(r.payment_reference),
      deposit_percent: num(r.deposit_percent),
      amount_paid: num(r.amount_paid),
      offer_code_snapshot: str(r.offer_code_snapshot),
      public_token: str(r.public_token),
      parent_order_id: str(r.parent_order_id),
      order_kind: str(r.order_kind),
    })),
    orderItems: many("order_items", (r) => ({
      id: r.id,
      order_id: r.order_id,
      product_id: str(r.product_id),
      product_name_snapshot: r.product_name_snapshot,
      quantity: num(r.quantity),
      unit_price: num(r.unit_price),
      line_discount: num(r.line_discount),
      line_total: num(r.line_total),
      product_image_url_snapshot: str(r.product_image_url_snapshot),
      modifier_labels: str(r.modifier_labels),
    })),
    payments: many("payments", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      order_id: r.order_id,
      amount: num(r.amount),
      method: r.method,
      status: r.status,
      created_at: r.created_at,
      split_label: str(r.split_label),
      notes: str(r.notes),
    })),
    offers: many("offers", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      name: r.name,
      code: str(r.code),
      discount_type: r.discount_type,
      discount_value: num(r.discount_value),
      scope: r.scope,
      scope_value: str(r.scope_value),
      min_order_amount: num(r.min_order_amount),
      max_discount: num(r.max_discount),
      starts_at: str(r.starts_at),
      ends_at: str(r.ends_at),
      is_active: bool(r.is_active),
      redemption_count: num(r.redemption_count),
      usage_limit: num(r.usage_limit),
    })),
    staff: many("staff", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      name: r.name,
      role: r.role,
      phone: str(r.phone),
      email: str(r.email),
      status: r.status,
      availability: r.availability,
      created_at: r.created_at,
    })),
    services: many("services", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      name: r.name,
      description: r.description,
      durationMinutes: num(r.durationMinutes),
      price: num(r.price),
      isActive: bool(r.isActive),
    })),
    serviceJobs: many("service_jobs", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      serviceId: r.serviceId,
      customerId: r.customerId,
      staffIds: json(r.staff_ids) ?? [],
      status: r.status,
      scheduledAt: str(r.scheduledAt),
      notes: r.notes,
    })),
    appointments: many("appointments", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      title: r.title,
      customerId: str(r.customerId),
      staffIds: json(r.staff_ids) ?? [],
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      location: r.location,
      serviceId: str(r.serviceId),
      status: r.status,
      notes: r.notes,
    })),
    visits: many("field_visits", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      customerId: r.customerId,
      staffId: r.staffId,
      purpose: r.purpose,
      status: r.status,
      checkInAt: str(r.checkInAt),
      checkOutAt: str(r.checkOutAt),
      report: str(r.report),
    })),
    shifts: many("shifts", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      staffId: r.staffId,
      date: r.date,
      start: r.start,
      end: r.end,
      note: r.note,
    })),
    tasks: many("tasks", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      title: r.title,
      description: r.description,
      assigneeStaffId: str(r.assigneeStaffId),
      customerId: str(r.customerId),
      priority: r.priority,
      dueAt: str(r.dueAt),
      status: r.status,
    })),
    leads: many("leads", (r) => ({
      id: r.id,
      brand_id: r.brand_id,
      contact_name: r.contact_name,
      phone: str(r.phone),
      email: str(r.email),
      source: str(r.source),
      requirement: r.requirement ?? "",
      site_address: str(r.site_address),
      stage: r.stage,
      estimated_value: num(r.estimated_value) ?? 0,
      owner_staff_id: str(r.owner_staff_id),
      next_action_at: str(r.next_action_at),
      quotation_number: str(r.quotation_number),
      created_at: r.created_at,
    })),
  };
}

/* One record per line: the diff stays readable and the file stays small. */
function table(value) {
  if (Array.isArray(value)) {
    return `[\n${value.map((row) => `    ${JSON.stringify(row)}`).join(",\n")},\n  ]`;
  }
  return JSON.stringify(value);
}

const imageSet = new Map();
const packs = BRANDS.map((b) => {
  const p = pack(b.code);
  const urls = new Set();
  for (const product of p.products) if (product.image_url) urls.add(product.image_url);
  for (const item of p.orderItems) {
    if (item.product_image_url_snapshot) urls.add(item.product_image_url_snapshot);
  }
  for (const url of urls) imageSet.set(url, b.code);
  return { ...b, pack: p };
});

let written = 0;
for (const [url, code] of imageSet) {
  const target = join(OUT, "data", "assets", code, url.split("/").pop());
  mkdirSync(dirname(target), { recursive: true });
  const buf = await sharp(join(PUBLIC, url))
    .resize({ width: 560, withoutEnlargement: true })
    .jpeg({ quality: 58, progressive: true, mozjpeg: true })
    .toBuffer();
  writeFileSync(target, buf);
  written += 1;
}

const assetKey = (url) => url.replace(/^\/demo\/products\//, "").replace(/\//g, "_").replace(/\.jpg$/, "");
const imageModule = `/*
 * Generated by scripts/embed-data.mjs — resized copies of the photos the seed
 * pack references, imported as modules so the demo folder stays self-contained.
 * Do not edit here; regenerate with: node scripts/embed-data.mjs "${OUT}"
 */
import type { StaticImageData } from "next/image";
${[...imageSet.keys()]
  .map((url, i) => `import asset${i} from "./assets/${imageSet.get(url)}/${url.split("/").pop()}";`)
  .join("\n")}

/** Keyed by the path the seed pack stores, e.g. /demo/products/BR-1/x.jpg */
export const PRODUCT_IMAGES: Record<string, StaticImageData> = {
${[...imageSet.keys()]
  .map((url, i) => `  ${JSON.stringify(url)}: asset${i}${i === imageSet.size - 1 ? "" : ","}`)
  .join("\n")},
};

export function productImage(url: string | null | undefined) {
  return url ? PRODUCT_IMAGES[url] ?? null : null;
}
`;
mkdirSync(join(OUT, "data"), { recursive: true });
writeFileSync(join(OUT, "data", "images.ts"), imageModule, "utf8");

for (const b of packs) {
  const body = Object.entries(b.pack)
    .map(([key, value]) => `  ${key}: ${table(value)}`)
    .join(",\n");
  writeFileSync(
    join(OUT, "data", `${b.slug}.ts`),
    `/*
 * Generated by scripts/embed-data.mjs from
 * ${relative(dirname(join(OUT, "data", `${b.slug}.ts`)), resolve(DATA, b.code)).replace(/\\/g, "/")}
 * — the same frozen seed pack the demo server reads. Do not edit here:
 *   node scripts/embed-data.mjs "${OUT}"
 */
import type { BrandPack } from "./types";

export const ${b.const}: BrandPack = {
${body},
};
`,
    "utf8",
  );
}

console.log(
  `${OUT}: ${packs.length} packs, ${written} images (${[...imageSet.keys()].length} referenced)`,
);
