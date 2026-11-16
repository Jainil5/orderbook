"use server";

import {
  auditBusinessOps,
  guardBusinessOps,
  revalidateBusiness,
} from "@/lib/business/actions-kit";
import {
  day,
  flag,
  money,
  oneOf,
  optionalQuantity,
  refId,
  text,
} from "@/lib/business/validate";
import {
  purchaseOrdersCollection,
  suppliersCollection,
} from "@/lib/business/registry";
import { listDemoProductsMerged } from "@/lib/demo/data";
import { updateBrand } from "@/lib/csv/records";
import {
  PURCHASE_ORDER_STATUSES,
  applyReceipt,
  canEditPurchaseOrderLines,
  isOpenPurchaseOrder,
  purchaseOrderTransitionError,
  receivedByLine,
  validatePurchaseOrderLines,
} from "@/lib/products/procurement";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  Supplier,
} from "@/types/business";

/**
 * Server actions for Products Manager → Inventory and → Procurement.
 *
 * Every action runs through `guardBusinessOps` (demo workspaces only until the
 * platform tables in docs/DATABASE_CONTRACT.md exist), validates its input with
 * the shared primitives, writes through the business collections, and leaves an
 * audit entry. Stock edits themselves stay on the existing
 * `recordStockAdjustmentAction` used by the shared adjustment panel.
 */

const MANAGER_PATH = "/manager/products";
const PROCUREMENT_PATH = "/manager/products/procurement";
const INVENTORY_PATH = "/manager/products/inventory";

type ActionResult = { ok: true } | { ok: false; message: string };

type Parsed<T> = { value: T } | { message: string };

function fail(message: string): { message: string } {
  return { message };
}

function invalid(message: string): ActionResult {
  return { ok: false, message };
}

function refreshProcurement(): void {
  revalidateBusiness(MANAGER_PATH, PROCUREMENT_PATH);
}

function refreshInventory(): void {
  revalidateBusiness(MANAGER_PATH, INVENTORY_PATH);
}

function optionalText(
  value: unknown,
  field: string,
  max: number,
): Parsed<string | null> {
  const parsed = text(value, field, max, false);
  return parsed.ok ? { value: parsed.value || null } : fail(parsed.message);
}

/** Whole number, blank allowed, bounded so a typo cannot poison the store. */
function optionalWhole(
  value: unknown,
  field: string,
  max: number,
): Parsed<number | null> {
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "" || raw == null) return { value: null };
  const parsed = optionalQuantity(raw, field);
  if (!parsed.ok) return fail(parsed.message);
  const whole = Math.round(parsed.value ?? 0);
  if (whole > max) return fail(`Enter ${field.toLowerCase()} of ${max} or less.`);
  return { value: whole };
}

export type SupplierInput = {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  category?: string;
  leadTimeDays?: string;
  paymentTerms?: string;
  notes?: string;
};

export async function saveSupplierAction(
  id: string | null,
  input: SupplierInput,
): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;

  const name = text(input.name, "Name", 120);
  if (!name.ok) return invalid(name.message);
  const contactName = optionalText(input.contactName, "Contact name", 120);
  if ("message" in contactName) return invalid(contactName.message);
  const phone = optionalText(input.phone, "Phone", 40);
  if ("message" in phone) return invalid(phone.message);
  const email = optionalText(input.email, "Email", 160);
  if ("message" in email) return invalid(email.message);
  const category = optionalText(input.category, "Category", 60);
  if ("message" in category) return invalid(category.message);
  const leadTimeDays = optionalWhole(input.leadTimeDays, "Lead time in days", 365);
  if ("message" in leadTimeDays) return invalid(leadTimeDays.message);
  const paymentTerms = optionalText(input.paymentTerms, "Payment terms", 60);
  if ("message" in paymentTerms) return invalid(paymentTerms.message);
  const notes = optionalText(input.notes, "Notes", 500);
  if ("message" in notes) return invalid(notes.message);

  const values: Partial<Supplier> = {
    name: name.value,
    contactName: contactName.value,
    phone: phone.value,
    email: email.value,
    category: category.value,
    leadTimeDays: leadTimeDays.value,
    paymentTerms: paymentTerms.value,
    notes: notes.value ?? "",
  };

  const suppliers = await suppliersCollection.load(guard.code);
  const existing = id ? suppliers.find((s) => s.id === id) : undefined;
  if (id && !existing) return invalid("Supplier not found.");

  if (existing) {
    await suppliersCollection.patch(guard.code, existing.id, values);
    await auditBusinessOps(
      guard,
      "supplier.updated",
      "supplier",
      existing.id,
      values.name ?? existing.name,
    );
  } else {
    const supplier: Supplier = {
      id: suppliersCollection.nextId(),
      brand_id: guard.brandId,
      name: values.name ?? "",
      contactName: values.contactName ?? null,
      phone: values.phone ?? null,
      email: values.email ?? null,
      category: values.category ?? null,
      leadTimeDays: values.leadTimeDays ?? null,
      paymentTerms: values.paymentTerms ?? null,
      notes: values.notes ?? "",
      is_active: true,
      created_at: new Date().toISOString(),
    };
    await suppliersCollection.append(guard.code, supplier);
    await auditBusinessOps(guard, "supplier.created", "supplier", supplier.id, supplier.name);
  }

  refreshProcurement();
  return { ok: true };
}

export async function deleteSupplierAction(id: string): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;

  const [suppliers, orders] = await Promise.all([
    suppliersCollection.load(guard.code),
    purchaseOrdersCollection.load(guard.code),
  ]);
  const supplier = suppliers.find((s) => s.id === id);
  if (!supplier) return invalid("Supplier not found.");

  const open = orders.filter(
    (po) => po.supplierId === id && isOpenPurchaseOrder(po),
  );
  if (open.length > 0) {
    return invalid(
      `This supplier still has ${open.length} open purchase order${open.length === 1 ? "" : "s"}. Cancel or receive them first.`,
    );
  }

  await suppliersCollection.remove(guard.code, id);
  await auditBusinessOps(guard, "supplier.deleted", "supplier", id, supplier.name);
  refreshProcurement();
  return { ok: true };
}

/** Pause or resume a supplier without losing its contact details. */
export async function setSupplierActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;

  const supplier = (await suppliersCollection.load(guard.code)).find(
    (s) => s.id === id,
  );
  if (!supplier) return invalid("Supplier not found.");

  await suppliersCollection.patch(guard.code, id, { is_active: flag(active) });
  await auditBusinessOps(
    guard,
    "supplier.status",
    "supplier",
    id,
    `${supplier.name}: ${flag(active) ? "reactivated" : "deactivated"}`,
  );
  refreshProcurement();
  return { ok: true };
}

export type PurchaseOrderLineInput = {
  productId: string | null;
  name: string;
  qty: string;
  unitCost: string;
};

export type PurchaseOrderInput = {
  supplierId: string;
  expectedOn?: string;
  notes?: string;
  lines: PurchaseOrderLineInput[];
};

function buildLines(
  input: PurchaseOrderLineInput[],
  products: { id: string; name: string }[],
): Parsed<PurchaseOrderLine[]> {
  const lines: PurchaseOrderLine[] = [];
  for (const raw of input) {
    const productId = typeof raw.productId === "string" && raw.productId ? raw.productId : null;
    const qty = money(raw.qty, "Quantity");
    if (!qty.ok) return fail(qty.message);
    const unitCost = money(raw.unitCost, "Unit cost");
    if (!unitCost.ok) return fail(unitCost.message);
    const name = productId
      ? (products.find((p) => p.id === productId)?.name ?? "")
      : "";
    if (productId && !name) {
      return fail("One of the ordered products does not belong to this business.");
    }
    const label = optionalText(raw.name, "Line description", 120);
    if ("message" in label) return fail(label.message);
    lines.push({
      productId,
      name: name || label.value || "Purchase line",
      qty: qty.value,
      unitCost: unitCost.value,
      receivedQty: 0,
    });
  }
  return { value: lines };
}

export async function savePurchaseOrderAction(
  id: string | null,
  input: PurchaseOrderInput,
): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    return invalid("Add at least one line.");
  }

  const [suppliers, products, orders] = await Promise.all([
    suppliersCollection.load(guard.code),
    listDemoProductsMerged({}, guard.code),
    purchaseOrdersCollection.load(guard.code),
  ]);

  // Drafts may exist before a supplier is chosen; placing the order is where the action enforces it.
  const supplierId = refId(input.supplierId, suppliers.map((s) => s.id), "Supplier", false);
  if (!supplierId.ok) return invalid(supplierId.message);
  const expected = day(input.expectedOn ?? "", "Expected date", false);
  if (!expected.ok) return invalid(expected.message);
  const notes = optionalText(input.notes, "Notes", 500);
  if ("message" in notes) return invalid(notes.message);

  const built = buildLines(input.lines.slice(0, 40), products);
  if ("message" in built) return invalid(built.message);
  const lineError = validatePurchaseOrderLines(built.value, products.map((p) => p.id));
  if (lineError) return invalid(lineError);

  const values = {
    supplierId: supplierId.value,
    expectedOn: expected.value || null,
    notes: notes.value ?? "",
    lines: built.value,
  };

  const existing = id ? orders.find((po) => po.id === id) : undefined;
  if (id && !existing) return invalid("Purchase order not found.");
  if (existing && !canEditPurchaseOrderLines(existing)) {
    return invalid(
      "Only draft orders can be edited. Use Receive stock to record what arrived.",
    );
  }

  if (existing) {
    await purchaseOrdersCollection.patch(guard.code, existing.id, values);
    await auditBusinessOps(
      guard,
      "purchase_order.updated",
      "purchase_order",
      existing.id,
      existing.poNumber,
    );
  } else {
    const order: PurchaseOrder = {
      id: purchaseOrdersCollection.nextId(),
      brand_id: guard.brandId,
      poNumber: `PO-${1000 + Math.floor(Math.random() * 9000)}`,
      status: "draft",
      createdAt: new Date().toISOString(),
      ...values,
    };
    await purchaseOrdersCollection.append(guard.code, order);
    await auditBusinessOps(
      guard,
      "purchase_order.created",
      "purchase_order",
      order.id,
      `${order.poNumber} · ${order.lines.length} lines`,
    );
  }

  refreshProcurement();
  return { ok: true };
}

export async function setPurchaseOrderStatusAction(
  id: string,
  status: PurchaseOrderStatus,
): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;

  const checked = oneOf(status, PURCHASE_ORDER_STATUSES, "Status");
  if (!checked.ok) return invalid(checked.message);

  const order = (await purchaseOrdersCollection.load(guard.code)).find(
    (po) => po.id === id,
  );
  if (!order) return invalid("Purchase order not found.");

  const error = purchaseOrderTransitionError(order, checked.value);
  if (error) return invalid(error);

  await purchaseOrdersCollection.patch(guard.code, id, { status: checked.value });
  await auditBusinessOps(
    guard,
    "purchase_order.status",
    "purchase_order",
    id,
    `${order.poNumber}: ${order.status} to ${checked.value}`,
  );
  refreshProcurement();
  return { ok: true };
}

/**
 * Book an incoming delivery: the order records what arrived and each product
 * line writes a stock adjustment, so the Inventory screen moves with it.
 */
export async function receivePurchaseOrderAction(
  id: string,
  quantities: number[],
): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;

  const order = (await purchaseOrdersCollection.load(guard.code)).find(
    (po) => po.id === id,
  );
  if (!order) return invalid("Purchase order not found.");

  const receipt = applyReceipt(order, Array.isArray(quantities) ? quantities : []);
  if (!receipt.ok) return invalid(receipt.error);

  await purchaseOrdersCollection.patch(guard.code, id, {
    lines: receipt.lines,
    status: receipt.status,
  });

  const incoming: { productId: string; qty: number }[] = [];
  for (const line of receivedByLine(order, receipt.lines)) {
    if (line.productId) incoming.push({ productId: line.productId, qty: line.qty });
  }

  const { recordDemoStockAdjustment } = await import("@/lib/demo/server");
  for (const line of incoming) {
    const result = await recordDemoStockAdjustment({
      productId: line.productId,
      deltaQty: line.qty,
      reason: `Received on ${order.poNumber}`,
    });
    if (!result.ok) return invalid(result.message);
  }

  await auditBusinessOps(
    guard,
    "purchase_order.received",
    "purchase_order",
    id,
    `${order.poNumber}: ${receipt.receivedUnits} units, now ${receipt.status}`,
  );
  refreshProcurement();
  refreshInventory();
  return { ok: true };
}

/** Set or clear the reorder level (low-stock threshold) for one product. */
export async function setReorderLevelAction(
  productId: string,
  threshold: string,
): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;

  const parsed = optionalWhole(threshold, "Reorder level", 1_000_000);
  if ("message" in parsed) return invalid(parsed.message);

  const product = (await listDemoProductsMerged({}, guard.code)).find(
    (p) => p.id === productId,
  );
  if (!product) return invalid("Product not found.");

  /* The row was just read from products.csv for this brand, so this write
     lands; `updateBrand` would only refuse if another brand had claimed the id
     in between, which the file-level tenancy check makes impossible. */
  updateBrand("products", guard.brandId, productId, {
    low_stock_threshold: parsed.value,
  });

  await auditBusinessOps(
    guard,
    "product.reorder_level",
    "product",
    productId,
    `${product.name}: reorder level ${parsed.value ?? "cleared"}`,
  );
  refreshInventory();
  return { ok: true };
}
