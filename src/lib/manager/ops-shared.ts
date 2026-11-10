export type OpsOverride<T> = Partial<T> & { deleted?: boolean };

export function mergeOpsEntities<T extends { id: string }>(
  base: readonly T[],
  additions: readonly T[],
  overrides: Record<string, OpsOverride<T>>,
): T[] {
  const byId = new Map<string, T>();
  for (const entity of [...base, ...additions]) {
    const override = overrides[entity.id];
    if (override) {
      const patch = { ...override };
      delete patch.deleted;
      byId.set(entity.id, { ...entity, ...patch });
    } else {
      byId.set(entity.id, entity);
    }
  }
  return Array.from(byId.values()).filter((e) => !overrides[e.id]?.deleted);
}

export function newOpsId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
