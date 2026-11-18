import type { BillDocument } from "@/lib/documents/types";
import { billDocumentFilename } from "@/lib/documents/build-bill-document";
import { loadImageDataUrl } from "@/lib/documents/load-image-data-url";
import { renderBillHtml, type BillHtmlAssets } from "@/lib/documents/render-bill-html";

/**
 * Open a saved bill or quotation as a standalone HTML file in the browser.
 * The file is built here in the tab — the same document the PDF button prints,
 * with its images inlined — so it works offline, can be bookmarked, forwarded
 * or printed, and never needs a server route for per-browser demo state.
 */

export type OpenBillHtmlResult =
  | { ok: true; where: "tab" }
  | { ok: true; where: "download" }
  | { ok: false; error: string };

let lastObjectUrl: string | null = null;

async function collectAssets(doc: BillDocument): Promise<BillHtmlAssets> {
  const logoDataUrl = doc.issuer?.logoPath
    ? await loadImageDataUrl(doc.issuer.logoPath)
    : null;
  const lineImageDataUrls =
    doc.kind === "quotation"
      ? await Promise.all(
          doc.lines.map((line) =>
            line.imageUrl?.trim()
              ? loadImageDataUrl(line.imageUrl.trim())
              : Promise.resolve(null),
          ),
        )
      : [];
  return { logoDataUrl, lineImageDataUrls };
}

function toBlobUrl(html: string): string {
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  // The previous file can go as soon as a newer one is opened; the tab that
  // already loaded it keeps working, since its document is in memory.
  if (lastObjectUrl && lastObjectUrl !== url) URL.revokeObjectURL(lastObjectUrl);
  lastObjectUrl = url;
  return url;
}

function saveAsFile(url: string, doc: BillDocument): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = billDocumentFilename(doc, "html");
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function openBillHtml(
  doc: BillDocument,
): Promise<OpenBillHtmlResult> {
  // Claim the tab while the click is still a user gesture. A quotation inlines
  // its product photos first, which costs a few network round trips — waiting
  // for those before window.open would make the browser treat it as a pop-up
  // and the merchant would get a download instead of the document on screen.
  const tab = window.open("", "_blank");
  let navigated = false;
  try {
    const html = renderBillHtml(doc, await collectAssets(doc));
    const url = toBlobUrl(html);
    if (tab && !tab.closed) {
      navigated = true;
      tab.opener = null;
      tab.location.href = url;
      return { ok: true, where: "tab" };
    }
    // Pop-ups blocked: hand the merchant the file instead of failing silently.
    saveAsFile(url, doc);
    return { ok: true, where: "download" };
  } catch (error) {
    if (tab && !navigated) tab.close?.();
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not build this document as HTML.",
    };
  }
}
