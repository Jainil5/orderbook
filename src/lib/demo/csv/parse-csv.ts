export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export type CsvRow = Record<string, string>;

export function parseCsvObjects(text: string, source: string): CsvRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((cells, idx) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `${source}: row ${idx + 2} has ${cells.length} cells, expected ${headers.length}`,
      );
    }
    const obj: CsvRow = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i];
    });
    return obj;
  });
}

export function str(v: string): string | null {
  return v === "" ? null : v;
}

export function reqStr(v: string, field: string, source: string): string {
  if (v === "") throw new Error(`${source}: missing required field "${field}"`);
  return v;
}

export function num(v: string, field = "", source = ""): number | null {
  if (v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) {
    throw new Error(`${source}: field "${field}" is not a number: ${v}`);
  }
  return n;
}

export function reqNum(v: string, field: string, source: string): number {
  const n = num(v, field, source);
  if (n === null) throw new Error(`${source}: missing required number "${field}"`);
  return n;
}

export function bool(v: string): boolean {
  return v === "true";
}

export function json<T>(v: string): T | null {
  if (v === "") return null;
  return JSON.parse(v) as T;
}