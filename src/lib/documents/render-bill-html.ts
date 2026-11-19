import { formatMoney } from "@/lib/format";
import {
  buildDetailRows,
  buildTotalsRows,
  formatDocumentDateTime,
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
  /** One data URL per line, in `doc.lines` order. */
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
  .brand img { height: 54px; width: auto; max-width: 210px; object-fit: contain; flex: none; }
  .brand h1 { margin: 0; font-size: 20px; letter-spacing: .01em; }
  .brand p { margin: 2px 0 0; color: var(--muted); font-size: 12.5px; }
  .doctype { text-align: right; flex: none; }
  .doctype strong { display: block; font-size: 15px; letter-spacing: .14em; color: var(--accent); }
  .doctype span { display: block; margin-top: 4px; font-size: 12.5px; color: var(--muted); }
  .details { margin: 22px 0 4px; padding: 12px 0;
    border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .details h2 { margin: 0 0 8px; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase;
    color: var(--muted); font-weight: 700; }
  .details dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 28px; margin: 0; }
  .details .row { display: flex; justify-content: space-between; gap: 14px; align-items: baseline; }
  .details dt { color: var(--muted); font-size: 12px; white-space: nowrap; }
  .details dd { margin: 0; font-size: 12.5px; font-weight: 600; text-align: right; }
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
  /* One footer holds everything after the money: terms, the signature, the
     brand's address, and the line saying what this paper is. */
  .sheet-footer { margin-top: 26px; padding-top: 12px; border-top: 1.5px solid var(--ink);
    font-size: 11.5px; color: var(--muted); }
  .sheet-footer h2 { margin: 0 0 4px; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase;
    color: var(--muted); font-weight: 700; }
  .sheet-footer .sign { display: flex; justify-content: space-between; gap: 24px; align-items: flex-end; }
  .sheet-footer .terms { flex: 1 1 55%; font-size: 12px; }
  .sheet-footer .box { flex: none; width: 190px; }
  .sheet-footer .box .for { font-size: 12.5px; font-weight: 600; margin: 0 0 30px; }
  .sheet-footer .box .rule { border-top: 1px solid var(--ink); padding-top: 4px; }
  .thankyou { margin: 18px 0 0; font-size: 12px; color: var(--muted); white-space: pre-wrap; }
  .colophon { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px;
    margin-top: 16px; padding-top: 9px; border-top: 1px solid var(--line); }
  .colophon .who { margin: 0 0 2px; color: var(--ink); font-weight: 700; font-size: 12.5px; }
  .colophon address { font-style: normal; line-height: 1.5; }
  .colophon .stamp { margin: 0; flex: none; max-width: 38%; text-align: right; }
  @media (max-width: 640px) {
    .sheet { padding: 22px 16px; margin: 0 0 28px; border-left: 0; border-right: 0; }
    .toolbar { padding: 12px 14px 0; }
    .letterhead { flex-direction: column; }
    .doctype { text-align: left; }
    .details dl { grid-template-columns: 1fr; }
    .totals table { width: 100%; }
    .sheet-footer .sign, .colophon { flex-direction: column; align-items: flex-start; }
    .colophon .stamp { max-width: none; text-align: left; }
  }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { max-width: none; margin: 0; border: 0; padding: 0; }
    @page { size: A4; margin: 14mm; }
  }
`;

/**
 * The masthead: who is issuing the paper and which document it is. The brand's
 * address and contact sit in the footer, the way a letterhead and a footnote
 * split on real stationery.
 */
function letterhead(doc: BillDocument, logoDataUrl?: string | null): string {
  const issuer = doc.issuer;
  const name = issuer?.legalName ?? doc.receiptHeader ?? doc.brandName;
  const mark = logoDataUrl
    ? `<img alt="" src="${escapeHtml(logoDataUrl)}">`
    : "";
  return `
  <header class="letterhead">
    <div class="brand">${mark}<div>
      <h1>${escapeHtml(name)}</h1>
      ${issuer ? `<p>${escapeHtml(issuer.tagline)}</p>` : ""}
    </div></div>
    <div class="doctype">
      <strong>${doc.kind === "quotation" ? "QUOTATION" : "TAX INVOICE"}</strong>
      <span>${escapeHtml(doc.orderNumber)}</span>
      <span>${escapeHtml(formatDocumentDateTime(doc.createdAt))}</span>
    </div>
  </header>`;
}

/** Flat details list — number, date, customer, mobile, and the rest. */
function detailsBlock(doc: BillDocument): string {
  const rows = buildDetailRows(doc)
    .map(
      (row) =>
        `<div class="row"><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(
          row.value,
        )}</dd></div>`,
    )
    .join("");
  return `
  <section class="details">
    <h2>${doc.kind === "quotation" ? "Quotation details" : "Bill details"}</h2>
    <dl>${rows}</dl>
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

/**
 * The foot of the sheet: terms and the signature, the brand's address and
 * contact, then the line saying what this paper is. The address lives here
 * rather than in the masthead so the document reads top-down — who issued it,
 * which order it is, what it costs, where to write.
 */
function documentFooter(doc: BillDocument, terms: string): string {
  const issuer = doc.issuer;
  const isQuote = doc.kind === "quotation";
  const contact = issuer
    ? `<address>${issuer.addressLines.map((line) => escapeHtml(line)).join("<br>")}<br>${escapeHtml(
        [
          issuer.phone,
          issuer.email,
          issuer.websiteUrl.replace(/^https?:\/\//, ""),
        ]
          .filter(Boolean)
          .join(" · "),
      )}</address>`
    : "";
  return `
<footer class="sheet-footer">
  <section class="sign">
    <div class="terms">
      <h2>${isQuote ? "Terms of this quotation" : "Terms"}</h2>
      ${escapeHtml(terms)}
    </div>
    <div class="box">
      <p class="for">${escapeHtml(issuer ? `For ${issuer.legalName}` : "Authorised signatory")}</p>
      <p class="rule">Signature</p>
    </div>
  </section>
  <div class="colophon">
    <div>
      <p class="who">${escapeHtml(issuer?.legalName ?? doc.brandName)}</p>
      ${contact}
    </div>
    <p class="stamp">Computer-generated ${isQuote ? "quotation" : "invoice"}${
      issuer ? ` from ${escapeHtml(issuer.legalName)}` : ""
    }.</p>
  </div>
</footer>`;
}

export function renderBillHtml(
  doc: BillDocument,
  assets: BillHtmlAssets = {},
): string {
  const isQuote = doc.kind === "quotation";
  const showPhoto = (assets.lineImageDataUrls ?? []).some((url) =>
    Boolean(url?.trim()),
  );
  const terms = isQuote
    ? (doc.issuer?.quotationTerms ??
      "Prices are exclusive of taxes unless stated above. Quotation valid for 15 days.")
    : (doc.issuer?.invoiceTerms ??
      "Payment as per agreed terms. Goods are covered by the company warranty policy.");
  const accent = doc.issuer
    ? `rgb(${doc.issuer.accentColor.join(", ")})`
    : "rgb(18, 99, 63)";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="OrderBook">
<title>${escapeHtml(billHtmlTitle(doc))}</title>
<style>:root{--accent:${accent};}${STYLE}</style>
</head>
<body>
<p class="toolbar">This is the ${isQuote ? "quotation" : "bill"} as saved in Orders — use your browser's
print or save-as-PDF if you want a copy of it.</p>
<main class="sheet">
${letterhead(doc, assets.logoDataUrl)}
${detailsBlock(doc)}
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
    ? `<p class="thankyou">${escapeHtml(doc.receiptFooter.trim())}</p>`
    : ""
}
${documentFooter(doc, terms)}
</main>
</body>
</html>
`;
}
