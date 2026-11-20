import { formatMoney } from "@/lib/format";
import {
  buildTotalsRows,
  paymentLabel,
  quotationValidUntil,
  serviceDateLabel,
  type TotalsRow,
} from "@/lib/documents/pdf-layout";
import type { BillDocument } from "@/lib/documents/types";

/**
 * The same document the PDF renderer draws, written as one standalone HTML
 * file so a merchant can open a bill or quotation in a browser tab, read it on
 * a phone, or print it to PDF from there. No scripts, no external CSS, no
 * network — every string that came from a merchant or a customer is escaped,
 * and images arrive as data URLs from the caller.
 */

export type BillHtmlAssets = {
  /** Brand mark, already a data URL so the file survives being moved. */
  logoDataUrl?: string | null;
  /** One data URL per line, in `doc.lines` order — quotations only. */
  lineImageDataUrls?: (string | null)[];
};

const ENTITY: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape before interpolation — customer names and notes are user input. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ENTITY[char] ?? char);
}

function money(amount: number, currencyCode: string): string {
  const text = formatMoney(Math.abs(amount), currencyCode);
  return amount < 0 ? `−${text}` : text;
}

function quantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function docDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dayOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function billHtmlTitle(doc: BillDocument): string {
  const label = doc.kind === "quotation" ? "Quotation" : "Bill";
  return `${label} ${doc.orderNumber} · ${doc.issuer?.legalName ?? doc.brandName}`;
}

const STYLE = `
  :root { --ink: #16211c; --muted: #5c6b62; --line: #d8e0da; --accent: #0f3a5a; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef2ef; color: var(--ink);
    font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .toolbar { max-width: 820px; margin: 0 auto; padding: 14px 20px 0;
    color: var(--muted); font-size: 13px; }
  .sheet { max-width: 820px; margin: 14px auto 40px; background: #fff; padding: 34px 38px;
    border: 1px solid var(--line); border-top: 4px solid var(--accent); }
  .letterhead { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
  .brand { display: flex; gap: 14px; min-width: 0; }
  .brand img { width: 62px; height: 62px; object-fit: contain; flex: none; }
  .brand h1 { margin: 0; font-size: 20px; letter-spacing: .01em; }
  .brand p { margin: 2px 0 0; color: var(--muted); font-size: 12.5px; }
  .brand address { margin: 6px 0 0; font-style: normal; color: var(--muted); font-size: 12px; }
  .doctype { text-align: right; flex: none; }
  .doctype strong { display: block; font-size: 15px; letter-spacing: .14em; color: var(--accent); }
  .doctype span { display: block; margin-top: 4px; font-size: 12.5px; color: var(--muted); }
  .meta { display: flex; flex-wrap: wrap; gap: 14px; margin: 22px 0 6px; }
  .meta > div { flex: 1 1 260px; border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
  .meta h2 { margin: 0 0 6px; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase;
    color: var(--muted); font-weight: 700; }
  .meta .who { margin: 0; font-weight: 600; }
  .meta ul { margin: 6px 0 0; padding: 0; list-style: none; color: var(--muted); font-size: 12.5px; }
  .meta li { margin-top: 2px; }
  .meta li b { color: var(--ink); font-weight: 600; }
  .descriptor { margin: 14px 0 8px; color: var(--muted); font-size: 12.5px; font-style: italic; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { text-align: left; padding: 8px 6px; border-bottom: 1.5px solid var(--ink);
    font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  tbody td { padding: 9px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.idx { color: var(--muted); width: 26px; }
  td.photo { width: 58px; }
  td.photo img { width: 52px; height: 52px; object-fit: cover; border-radius: 6px; display: block; }
  .item-name { font-weight: 600; }
  .item-meta { margin-top: 3px; color: var(--muted); font-size: 11.5px; }
  .disc { color: #a4342c; }
  .totals { display: flex; justify-content: flex-end; margin-top: 14px; }
  .totals table { width: 320px; }
  .totals td { border: 0; padding: 4px 6px; }
  .totals tr.head td { border-top: 1px solid var(--line); }
  .totals tr.strong td { font-weight: 700; font-size: 14.5px; }
  .totals tr.sub td { color: var(--muted); font-size: 12px; }
  .block { margin-top: 18px; }
  .block h2 { margin: 0 0 4px; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase;
    color: var(--muted); font-weight: 700; }
  .block p { margin: 0; font-size: 12.5px; white-space: pre-wrap; }
  .sign { display: flex; justify-content: space-between; gap: 24px; margin-top: 26px;
    align-items: flex-end; }
  .sign .terms { flex: 1 1 55%; font-size: 12px; color: var(--muted); }
  .sign .box { width: 190px; text-align: left; }
  .sign .box .for { font-size: 12.5px; font-weight: 600; margin-bottom: 30px; }
  .sign .box .rule { border-top: 1px solid var(--ink); padding-top: 4px; font-size: 11.5px;
    color: var(--muted); }
  .sheet-footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 26px;
    padding-top: 8px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--muted); }
  @media (max-width: 640px) {
    .sheet { padding: 22px 16px; margin: 0 0 28px; border-left: 0; border-right: 0; }
    .toolbar { padding: 12px 14px 0; }
    .letterhead { flex-direction: column; }
    .doctype { text-align: left; }
    .totals table { width: 100%; }
  }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { max-width: none; margin: 0; border: 0; padding: 0; }
    @page { size: A4; margin: 14mm; }
  }
`;

function letterhead(doc: BillDocument, logoDataUrl?: string | null): string {
  const issuer = doc.issuer;
  const name = issuer?.legalName ?? doc.receiptHeader ?? doc.brandName;
  const mark = logoDataUrl
    ? `<img alt="" src="${escapeHtml(logoDataUrl)}">`
    : "";
  const contact = issuer
    ? `<address>${issuer.addressLines.map((line) => escapeHtml(line)).join("<br>")}<br>
        ${escapeHtml(issuer.phone)} · ${escapeHtml(issuer.email)} · ${escapeHtml(issuer.websiteUrl)}</address>`
    : "";
  return `
  <header class="letterhead">
    <div class="brand">${mark}<div>
      <h1>${escapeHtml(name)}</h1>
      ${issuer ? `<p>${escapeHtml(issuer.tagline)}</p>` : ""}
      ${contact}
    </div></div>
    <div class="doctype">
      <strong>${doc.kind === "quotation" ? "QUOTATION" : "TAX INVOICE"}</strong>
      <span>${escapeHtml(doc.orderNumber)}</span>
      <span>${escapeHtml(docDate(doc.createdAt))}</span>
    </div>
  </header>`;
}

function metaCards(doc: BillDocument): string {
  const isQuote = doc.kind === "quotation";
  const isProject = doc.capture === "project";
  const left: string[] = [];
  if (doc.customerPhone) left.push(`Mobile <b>${escapeHtml(doc.customerPhone)}</b>`);
  if (doc.customerAddress?.trim()) {
    left.push(
      `${isProject ? "Site" : "Deliver to"} <b>${escapeHtml(doc.customerAddress.trim())}</b>`,
    );
  }
  const right: string[] = [
    `Currency <b>${escapeHtml(doc.currencyCode)}</b>`,
  ];
  if (doc.serviceDate) {
    right.push(
      `${serviceDateLabel(isQuote, doc.capture)} <b>${escapeHtml(dayOnly(doc.serviceDate))}</b>`,
    );
  }
  if (isQuote) {
    right.push(`Valid until <b>${escapeHtml(quotationValidUntil(doc.createdAt))}</b>`);
    right.push("Status <b>Awaiting acceptance</b>");
  } else {
    if (doc.referenceNumber) {
      right.push(`Against quotation <b>${escapeHtml(doc.referenceNumber)}</b>`);
    }
    right.push(`Payment <b>${escapeHtml(paymentLabel(doc))}</b>`);
  }
  return `
  <section class="meta">
    <div>
      <h2>${isQuote ? "Quote for" : "Bill to"}</h2>
      <p class="who">${escapeHtml(doc.customerName?.trim() || "Walk-in customer")}</p>
      ${left.length ? `<ul>${left.map((line) => `<li>${line}</li>`).join("")}</ul>` : ""}
    </div>
    <div>
      <h2>Document details</h2>
      <ul>${right.map((line) => `<li>${line}</li>`).join("")}</ul>
    </div>
  </section>`;
}

function lineRows(
  doc: BillDocument,
  assets: BillHtmlAssets,
  showPhoto: boolean,
): string {
  const photos = assets.lineImageDataUrls ?? [];
  return doc.lines
    .map((line, index) => {
      const photo = showPhoto
        ? `<td class="photo">${
            photos[index]
              ? `<img alt="" src="${escapeHtml(photos[index] as string)}">`
              : ""
          }</td>`
        : "";
      const meta = [line.sku?.trim(), line.description?.trim()]
        .filter(Boolean)
        .map((text) => escapeHtml(text as string))
        .join(" — ");
      const unit = line.unit?.trim();
      return `
      <tr>
        <td class="idx">${index + 1}</td>
        ${photo}
        <td>
          <div class="item-name">${escapeHtml(line.name)}</div>
          ${meta ? `<div class="item-meta">${meta}</div>` : ""}
        </td>
        <td class="num">${quantity(line.quantity)}${unit ? ` ${escapeHtml(unit)}` : ""}</td>
        <td class="num">${escapeHtml(money(line.listUnitPrice, doc.currencyCode))}</td>
        <td class="num${line.lineDiscount > 0 ? " disc" : ""}">${
          line.lineDiscount > 0
            ? escapeHtml(money(-line.lineDiscount, doc.currencyCode))
            : "—"
        }</td>
        <td class="num">${escapeHtml(money(line.lineTotal, doc.currencyCode))}</td>
      </tr>`;
    })
    .join("");
}

function totalsTable(rows: TotalsRow[], currencyCode: string): string {
  const body = rows
    .map((row) => {
      const cls =
        row.tone === "strong"
          ? "strong"
          : row.tone === "sub"
            ? "sub"
            : row.tone === "discount"
              ? "disc"
              : "";
      return `<tr class="${cls}"><td>${escapeHtml(row.label)}</td><td class="num">${escapeHtml(
        money(row.amount, currencyCode),
      )}</td></tr>`;
    })
    .join("");
  return `<div class="totals"><table><tbody>${body}</tbody></table></div>`;
}

export function renderBillHtml(
  doc: BillDocument,
  assets: BillHtmlAssets = {},
): string {
  const isQuote = doc.kind === "quotation";
  const showPhoto =
    isQuote && (assets.lineImageDataUrls ?? []).some((url) => Boolean(url));
  const terms = isQuote
    ? (doc.issuer?.quotationTerms ??
      "Prices are exclusive of taxes unless stated above. Quotation valid for 15 days.")
    : (doc.issuer?.invoiceTerms ??
      "Payment as per agreed terms. Goods are covered by the company warranty policy.");
  const accent = doc.issuer
    ? `rgb(${doc.issuer.accentColor.join(", ")})`
    : "rgb(18, 99, 63)";
  const site = (doc.issuer?.websiteUrl ?? "OrderBook").replace(/^https?:\/\//, "");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="OrderBook">
<title>${escapeHtml(billHtmlTitle(doc))}</title>
<style>${STYLE}:root{--accent:${accent};}</style>
</head>
<body>
<p class="toolbar">This is the ${isQuote ? "quotation" : "bill"} as saved in Orders — use your browser's
print or save-as-PDF if you want a copy of it.</p>
<main class="sheet">
${letterhead(doc, assets.logoDataUrl)}
${metaCards(doc)}
<p class="descriptor">${
    isQuote
      ? "Proforma estimate — not a receipt until payment is confirmed."
      : "Bill / receipt for the goods and services listed below."
  }</p>
<table>
  <thead>
    <tr>
      <th>#</th>
      ${showPhoto ? "<th>Photo</th>" : ""}
      <th>Description</th>
      <th class="num">Qty</th>
      <th class="num">Rate</th>
      <th class="num">Discount</th>
      <th class="num">Amount</th>
    </tr>
  </thead>
  <tbody>${lineRows(doc, assets, showPhoto)}</tbody>
</table>
${totalsTable(buildTotalsRows(doc), doc.currencyCode)}
${
  doc.notes?.trim()
    ? `<section class="block"><h2>Notes</h2><p>${escapeHtml(doc.notes.trim())}</p></section>`
    : ""
}
${
  doc.receiptFooter?.trim()
    ? `<section class="block"><p>${escapeHtml(doc.receiptFooter.trim())}</p></section>`
    : ""
}
<section class="sign">
  <div class="terms">
    <h2 style="margin:0 0 4px;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">${
      isQuote ? "Terms of this quotation" : "Terms"
    }</h2>
    ${escapeHtml(terms)}
  </div>
  <div class="box">
    <p class="for">${escapeHtml(doc.issuer ? `For ${doc.issuer.legalName}` : "Authorised signatory")}</p>
    <p class="rule">Signature</p>
  </div>
</section>
<footer class="sheet-footer">
  <span>Computer-generated ${isQuote ? "quotation" : "invoice"} from ${escapeHtml(
    doc.issuer?.legalName ?? doc.brandName,
  )}.</span>
  <span>${escapeHtml(site)}</span>
</footer>
</main>
</body>
</html>
`;
}
