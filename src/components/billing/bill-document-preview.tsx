"use client";

import type { ReactNode } from "react";
import type { BillDocument } from "@/lib/documents/types";
import {
  buildDetailRows,
  buildTotalsRows,
  formatDocumentDateTime,
} from "@/lib/documents/pdf-layout";
import { formatMoney } from "@/lib/format";
import { ProductThumbnail } from "@/components/products/product-thumbnail";
import { LogoMark } from "@/components/brand/logo-mark";
import { cn } from "@/lib/cn";

/**
 * The issued document, drawn on screen in the same order the browser and PDF
 * copies print it — masthead, the document's own details, the lines, the money,
 * then a footer carrying the terms and the address. Reading the bill here is the
 * common case at a counter — reaching for a tab or a PDF to check what was just
 * charged is not. Nothing here is boxed into cards: a bill is a sheet of paper.
 */

function money(amount: number, currencyCode: string): string {
  const text = formatMoney(Math.abs(amount), currencyCode);
  return amount < 0 ? `−${text}` : text;
}

export function BillDocumentPreview({
  document: doc,
  className,
  actions,
}: {
  document: BillDocument;
  className?: string;
  /** Export buttons, kept inside the sheet so the paper and its actions stay together. */
  actions?: ReactNode;
}) {
  const isQuote = doc.kind === "quotation";
  const issuer = doc.issuer;
  const totalsRows = buildTotalsRows(doc);
  const hasPhotos = doc.lines.some((line) => line.imageUrl?.trim());
  const hasLineDiscount = doc.lines.some((line) => line.lineDiscount > 0);
  const terms = isQuote
    ? (issuer?.quotationTerms ??
      "Prices are exclusive of taxes unless stated above. Quotation valid for 15 days.")
    : (issuer?.invoiceTerms ??
      "Payment as per agreed terms. Goods are covered by the company warranty policy.");

  return (
    <div className={cn("ob-bill", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {issuer?.logoPath ? (
            <span className="ob-bill-mark">
              {/* eslint-disable-next-line @next/next/no-img-element -- demo brand mark on the bill's letterhead */}
              <img
                src={issuer.logoPath}
                alt=""
                width={40}
                height={40}
                className="h-7 w-auto max-w-[5.5rem] object-contain"
              />
            </span>
          ) : (
            <LogoMark size={30} />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {issuer?.legalName ?? doc.receiptHeader ?? doc.brandName}
            </p>
            <p className="truncate text-[11px] text-[var(--ob-text-muted)]">
              {issuer ? issuer.tagline : doc.brandName}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="ob-bill-label mb-0.5">
            {isQuote ? "Quotation" : "Tax invoice"}
          </p>
          <p className="text-xs font-semibold">{doc.orderNumber}</p>
          <p className="text-[11px] text-[var(--ob-text-muted)]">
            {formatDocumentDateTime(doc.createdAt)}
          </p>
        </div>
      </header>

      {/* The document's own details, one flat list: number, date, customer,
          mobile, and whatever else identifies this sheet. */}
      <dl className="ob-bill-rule mt-3 grid gap-x-5 gap-y-0.5 pt-3 text-xs sm:grid-cols-2">
        <div className="ob-bill-label sm:col-span-2">
          {isQuote ? "Quotation details" : "Bill details"}
        </div>
        {buildDetailRows(doc).map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="text-[var(--ob-text-muted)]">{row.label}</dt>
            <dd className="min-w-0 text-right font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>

      <table className="mt-3 w-full text-[13px]">
        <thead>
          <tr className="ob-bill-label">
            <th className="pb-1 text-left font-semibold">
              {doc.lines.length} lines
            </th>
            <th className="pb-1 text-right font-semibold">Qty</th>
            <th className="pb-1 text-right font-semibold">Rate</th>
            {hasLineDiscount ? (
              <th className="pb-1 text-right font-semibold">Disc</th>
            ) : null}
            <th className="pb-1 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line, index) => (
            <tr
              key={`${line.name}-${index}`}
              className="border-t border-dashed border-[var(--ob-line)]"
            >
              <td className="flex items-start gap-2 py-2">
                {hasPhotos ? (
                  <ProductThumbnail
                    name={line.name}
                    imageUrl={line.imageUrl}
                    size="sm"
                    className="h-9 w-10"
                  />
                ) : null}
                <span className="min-w-0">
                  <span className="block font-medium">{line.name}</span>
                  {line.sku?.trim() || line.description?.trim() ? (
                    <span className="block text-[11px] text-[var(--ob-text-muted)]">
                      {[line.sku?.trim(), line.description?.trim()]
                        .filter(Boolean)
                        .join(" — ")}
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="ob-bill-figure px-1 py-2 text-right align-top text-[var(--ob-text-muted)]">
                {line.quantity}
                {line.unit ? ` ${line.unit}` : ""}
              </td>
              <td className="ob-bill-figure px-1 py-2 text-right align-top">
                {money(line.listUnitPrice, doc.currencyCode)}
              </td>
              {hasLineDiscount ? (
                <td className="ob-bill-figure px-1 py-2 text-right align-top text-[var(--ob-success)]">
                  {line.lineDiscount > 0
                    ? money(-line.lineDiscount, doc.currencyCode)
                    : "—"}
                </td>
              ) : null}
              <td className="ob-bill-figure px-1 py-2 text-right align-top font-medium">
                {money(line.lineTotal, doc.currencyCode)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ob-bill-rule mt-3 space-y-1 pt-3 text-[13px]">
        {totalsRows.map((row) => (
          <div
            key={row.label}
            className={cn(
              "flex items-baseline justify-between gap-3",
              row.tone === "strong" && "text-sm font-semibold",
              row.tone === "discount" && "text-[var(--ob-success)]",
              row.tone === "sub" && "text-[11px] text-[var(--ob-text-muted)]",
            )}
          >
            <dt>{row.label}</dt>
            <dd className="ob-bill-figure">{money(row.amount, doc.currencyCode)}</dd>
          </div>
        ))}
      </dl>

      {doc.notes?.trim() ? (
        <p className="mt-3 text-xs text-[var(--ob-text-muted)]">
          <span className="ob-bill-label mb-0.5">Notes</span>
          {doc.notes.trim()}
        </p>
      ) : null}

      {doc.receiptFooter?.trim() ? (
        <p className="mt-3 text-[11px] text-[var(--ob-text-muted)]">
          {doc.receiptFooter.trim()}
        </p>
      ) : null}

      {/* Footer, same as the printed sheet: terms, then where the brand is and
          how to reach it. */}
      <footer className="ob-bill-rule mt-3 pt-2 text-[11px] text-[var(--ob-text-muted)]">
        <p className="ob-bill-label mb-0.5">
          {isQuote ? "Terms of this quotation" : "Terms"}
        </p>
        <p>{terms}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t border-[var(--ob-line)] pt-2">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold">
              {issuer?.legalName ?? doc.brandName}
            </p>
            {issuer ? (
              <address className="not-italic leading-snug">
                {[
                  issuer.addressLines.join(", "),
                  [
                    issuer.phone,
                    issuer.email,
                    issuer.websiteUrl.replace(/^https?:\/\//, ""),
                  ]
                    .filter(Boolean)
                    .join(" · "),
                ]
                  .filter(Boolean)
                  .join(" — ")}
              </address>
            ) : null}
          </div>
          <p className="text-right">
            Computer-generated {isQuote ? "quotation" : "invoice"}
            {issuer ? ` from ${issuer.legalName}` : ""}.
          </p>
        </div>
      </footer>

      {actions}
    </div>
  );
}
