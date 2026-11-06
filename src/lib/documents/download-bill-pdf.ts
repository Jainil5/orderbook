import type { BillDocument } from "@/lib/documents/types";
import { billDocumentFilename } from "@/lib/documents/build-bill-document";
import { loadImageDataUrl } from "@/lib/documents/load-image-data-url";
import { renderBillPdf } from "@/lib/documents/render-bill-pdf";

export async function downloadBillPdf(doc: BillDocument): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  let logoDataUrl: string | null = null;
  if (doc.issuer?.logoPath) {
    logoDataUrl = await loadImageDataUrl(doc.issuer.logoPath);
  }
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
  renderBillPdf(doc, pdf, { logoDataUrl, lineImageDataUrls });
  pdf.save(billDocumentFilename(doc));
}
