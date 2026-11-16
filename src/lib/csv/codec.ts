/**
 * Minimal RFC-4180 CSV codec for the `data/*.csv` storage layer.
 *
 * Rules, stated plainly so hand-edits in Excel or Numbers survive a round trip:
 * - fields containing commas, quotes, or newlines are wrapped in double quotes;
 * - a double quote inside a quoted field is written as `""`;
 * - a blank line is ignored (trailing newlines are formatting, not rows);
 * - CRLF and LF are both accepted on read; writes use LF.
 *
 * This file is pure string work — no fs, no types, no imports — so the schema
 * layer above it owns everything that knows what a column *means*.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let sawContent = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // A completely blank line (single empty field) is skipped, but a quoted
    // empty cell counts as content.
    if (!(row.length === 1 && row[0] === "" && !sawContent)) rows.push(row);
    row = [];
    sawContent = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      sawContent = true;
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\n") {
      endRow();
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
      continue;
    }
    field += ch;
    sawContent = true;
  }

  if (field !== "" || row.length > 0 || sawContent) endRow();

  return rows;
}

const NEEDS_QUOTES = /[",\n\r]/;

function encodeCell(value: string): string {
  if (value === "") return "";
  return NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function formatCsv(rows: string[][]): string {
  return rows.map((row) => row.map(encodeCell).join(",")).join("\n") + "\n";
}
