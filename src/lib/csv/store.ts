/**
 * The file-backed store behind `data/*.csv`.
 *
 * Server-only — uses Node fs directly and is imported exclusively from server
 * modules (demo loaders, services, server actions). Design choices:
 *
 * - Sync reads with an mtime+size cache: the demo loaders that were already
 *   synchronous (`listDemoProducts`) stay synchronous, and each file is parsed
 *   once until it changes on disk. On Railway the filesystem is ephemeral, so
 *   a fresh container re-seeds from the checked-in packs on first read.
 * - Auto-seed: if a table file is missing, it is created from the fixture data
 *   on first access. The app never needs a "run migrations" step.
 * - Atomic writes: a temp file plus rename, so a crash mid-write can't leave a
 *   half-written table behind.
 * - Rows are returned as shallow copies; a caller mutating a row cannot poison
 *   the cache for the next request.
 *
 * Set `OB_DATA_DIR` to point the store somewhere else (tests use a temp dir).
 */

import fs from "node:fs";
import path from "node:path";
import { formatCsv, parseCsv } from "./codec";
import {
  TABLE_SCHEMAS,
  decodeRow,
  encodeRow,
  headerRow,
  type CsvTable,
} from "./schema";
import { seedTableRows } from "./seed";

type CacheEntry = { key: string; rows: Record<string, unknown>[] };

const cache = new Map<CsvTable, CacheEntry>();

export function dataDir(): string {
  return process.env.OB_DATA_DIR?.trim() || path.join(process.cwd(), "data");
}

export function tableFile(table: CsvTable): string {
  return path.join(dataDir(), TABLE_SCHEMAS[table].file);
}

export function resetCsvCache(): void {
  cache.clear();
}

function writeFile(table: CsvTable, rows: Record<string, unknown>[]): void {
  const file = tableFile(table);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = formatCsv([
    headerRow(table),
    ...rows.map((row) => encodeRow(table, row)),
  ]);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body, "utf8");
  fs.renameSync(tmp, file);
  cache.delete(table);
}

function seedIfMissing(table: CsvTable): void {
  if (fs.existsSync(tableFile(table))) return;
  writeFile(table, seedTableRows(table));
}

export function readAllRows(table: CsvTable): Record<string, unknown>[] {
  seedIfMissing(table);
  const file = tableFile(table);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return [];
  }
  const key = `${stat.mtimeMs}:${stat.size}`;
  const cached = cache.get(table);
  if (cached && cached.key === key) return cached.rows.map((r) => ({ ...r }));
  const text = fs.readFileSync(file, "utf8");
  const parsed = parseCsv(text);
  const rows =
    parsed.length <= 1
      ? []
      : parsed.slice(1).map((cells) => decodeRow(table, cells));
  cache.set(table, { key, rows });
  return rows.map((r) => ({ ...r }));
}

export function readBrandRows(
  table: CsvTable,
  brandId: string,
): Record<string, unknown>[] {
  return readAllRows(table).filter((row) => row.brand_id === brandId);
}

export function findRow(
  table: CsvTable,
  id: string,
): Record<string, unknown> | null {
  return readAllRows(table).find((row) => row.id === id) ?? null;
}

export function upsertRow(
  table: CsvTable,
  row: Record<string, unknown>,
): void {
  const rows = readAllRows(table);
  const index = rows.findIndex((existing) => existing.id === row.id);
  if (index >= 0) rows[index] = { ...rows[index], ...row };
  else rows.push(row);
  writeFile(table, rows);
}

export function patchRow(
  table: CsvTable,
  id: string,
  patch: Record<string, unknown>,
): boolean {
  const rows = readAllRows(table);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return false;
  rows[index] = { ...rows[index], ...patch, id };
  writeFile(table, rows);
  return true;
}

export function removeRow(table: CsvTable, id: string): boolean {
  const rows = readAllRows(table);
  const next = rows.filter((row) => row.id !== id);
  if (next.length === rows.length) return false;
  writeFile(table, next);
  return true;
}

export function replaceAllRows(
  table: CsvTable,
  rows: Record<string, unknown>[],
): void {
  writeFile(table, rows);
}
