export type OpsOverride<T> = Partial<T> & { deleted?: boolean };

export function mergeOpsEntities<T extends { id: string }>(
  base: readonly T[],
  additions: readonly T[],
  overrides: Record<string, OpsOverride<T>>,
): T[] {
  const byId = new Map<string, T>();
  for (const entity of [...base, ...additions]) {
    const { deleted: _deleted, ...patch } = overrides[entity.id] ?? {};
    byId.set(entity.id, { ...entity, ...patch });
  }
  return Array.from(byId.values()).filter((e) => !overrides[e.id]?.deleted);
}

export function newOpsId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
