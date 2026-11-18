import type {
  Product,
  ProductModifier,
  ProductModifierGroup,
  ProductModifierOption,
  ProductModifiersJson,
} from "@/types/database";

export type ModifierGroup = ProductModifierGroup;
export type ModifierOption = ProductModifierOption;

/** Bounds kept in one place so CSV rows and the group editor agree. */
export const MAX_MODIFIER_GROUPS = 8;
export const MAX_MODIFIER_OPTIONS = 12;
/** Option prices are deltas, so they can go negative (a smaller size). */
export const MAX_MODIFIER_DELTA = 100_000;

const LEGACY_GROUP_ID = "addons";
const LEGACY_GROUP_NAME = "Add-ons";

function isGroupRow(row: ProductModifierGroup | ProductModifier): boolean {
  return Array.isArray((row as ProductModifierGroup).options);
}

function parseOption(value: unknown): ModifierOption | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  const name = String(r.name ?? "").trim();
  const price = Number(r.price);
  if (!id || !name || !Number.isFinite(price) || Math.abs(price) > MAX_MODIFIER_DELTA) {
    return null;
  }
  return {
    id,
    name,
    price: Math.round(price * 100) / 100,
    ...(r.default === true ? { default: true } : {}),
  };
}

function parseGroup(value: unknown): ModifierGroup | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  const name = String(r.name ?? "").trim();
  if (!id || !name || !Array.isArray(r.options)) return null;
  const options: ModifierOption[] = [];
  const seen = new Set<string>();
  for (const raw of r.options.slice(0, MAX_MODIFIER_OPTIONS)) {
    const option = parseOption(raw);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
  }
  if (!options.length) return null;
  return {
    id,
    name,
    type: r.type === "multi" ? "multi" : "single",
    ...(r.required === true ? { required: true } : {}),
    options,
  };
}

/**
 * Read a product's customizations as groups. A legacy flat add-on list
 * (`[{ id, name, price }]`) becomes one optional multi-select "Add-ons" group,
 * so every caller below can assume the same shape.
 */
export function parseProductModifiers(product: Product): ModifierGroup[] {
  const raw = product.modifiers_json as ProductModifiersJson | null | undefined;
  if (!raw || !Array.isArray(raw)) return [];

  const groups: ModifierGroup[] = [];
  const legacy: ModifierOption[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    if (isGroupRow(row)) {
      const group = parseGroup(row);
      if (group) groups.push(group);
      continue;
    }
    const option = parseOption(row);
    if (option) legacy.push(option);
  }

  if (legacy.length) {
    groups.unshift({
      id: LEGACY_GROUP_ID,
      name: LEGACY_GROUP_NAME,
      type: "multi",
      options: legacy,
    });
  }

  // Option ids address a line's picks, so they have to be unique per product.
  const seenGroupIds = new Set<string>();
  const seenOptionIds = new Set<string>();
  const unique: ModifierGroup[] = [];
  for (const group of groups) {
    if (seenGroupIds.has(group.id)) continue;
    seenGroupIds.add(group.id);
    group.options = group.options.filter((option) => {
      if (seenOptionIds.has(option.id)) return false;
      seenOptionIds.add(option.id);
      return true;
    });
    if (group.options.length) unique.push(group);
    if (unique.length === MAX_MODIFIER_GROUPS) break;
  }
  return unique;
}

/** Normalize groups for storage (trims ids/labels, rounds deltas, drops empties). */
export function serializeProductModifiers(
  groups: ModifierGroup[],
): ModifierGroup[] {
  return groups
    .filter((group): group is ModifierGroup => !!group && typeof group === "object")
    .map((group): ModifierGroup => ({
      id: String(group.id ?? "").trim().slice(0, 40),
      name: String(group.name ?? "").trim().slice(0, 60),
      type: group.type === "multi" ? "multi" : "single",
      ...(group.required ? { required: true } : {}),
      options: (Array.isArray(group.options) ? group.options : [])
        .filter((option) => !!option && typeof option === "object")
        .map((option): ModifierOption => ({
          id: String(option.id ?? "").trim().slice(0, 40),
          name: String(option.name ?? "").trim().slice(0, 80),
          price: Math.round(Number(option.price) * 100) / 100,
          ...(option.default ? { default: true } : {}),
        }))
        .filter(
          (option) =>
            option.id &&
            option.name &&
            Number.isFinite(option.price) &&
            Math.abs(option.price) <= MAX_MODIFIER_DELTA,
        )
        .slice(0, MAX_MODIFIER_OPTIONS),
    }))
    .filter((group) => group.id && group.name && group.options.length)
    .slice(0, MAX_MODIFIER_GROUPS);
}

/** The choice a line starts with: the default of each group that has one. */
export function defaultModifierSelection(groups: ModifierGroup[]): string[] {
  const ids: string[] = [];
  for (const group of groups) {
    const marked = group.options.filter((option) => option.default);
    if (group.type === "single") {
      const picked = marked[0] ?? (group.required ? group.options[0] : undefined);
      if (picked) ids.push(picked.id);
      continue;
    }
    for (const option of marked) ids.push(option.id);
  }
  return ids;
}

/**
 * Resolve a line's picks into concrete options.
 *
 * - No ids at all (API order, seeded bill, older cart) → the default selection.
 * - `single` group → its last valid pick, else its default, else the first
 *   option when the group is required. So a required choice always has a price.
 * - `multi` group → every valid pick it carries; unchecking a preselected
 *   default is respected.
 */
export function resolveModifierOptions(
  product: Product,
  modifierIds?: string[],
): { group: ModifierGroup; option: ModifierOption }[] {
  const groups = parseProductModifiers(product);
  if (!groups.length) return [];
  const picks = modifierIds ?? [];

  if (!picks.length) {
    const defaults = defaultModifierSelection(groups);
    return groups.flatMap((group) =>
      group.options
        .filter((option) => defaults.includes(option.id))
        .map((option) => ({ group, option })),
    );
  }

  const out: { group: ModifierGroup; option: ModifierOption }[] = [];
  for (const group of groups) {
    const chosen = group.options.filter((option) => picks.includes(option.id));
    if (group.type === "single") {
      const option =
        chosen[chosen.length - 1] ??
        group.options.find((o) => o.default) ??
        (group.required ? group.options[0] : undefined);
      if (option) out.push({ group, option });
      continue;
    }
    for (const option of chosen) out.push({ group, option });
  }
  return out;
}

/** Sum of the resolved deltas — can be negative when a cheaper size is picked. */
export function modifierPriceDelta(
  product: Product,
  modifierIds?: string[],
): number {
  const delta = resolveModifierOptions(product, modifierIds).reduce(
    (sum, { option }) => sum + option.price,
    0,
  );
  return Math.round(delta * 100) / 100;
}

/** Labels for the bill line and the saved order item, in group order. */
export function modifierLabels(
  product: Product,
  modifierIds?: string[],
): string | null {
  const resolved = resolveModifierOptions(product, modifierIds);
  return resolved.length ? resolved.map(({ option }) => option.name).join(", ") : null;
}
