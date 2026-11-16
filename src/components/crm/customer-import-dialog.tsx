"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CUSTOMER_CSV_HEADERS } from "@/lib/crm/directory";
import { importCustomersCsvAction } from "@/services/crm-actions";

const TEMPLATE = [
  CUSTOMER_CSV_HEADERS.join(","),
  'Priya Shetty,priya@example.com,+91 98200 00001,active,Instagram,"regular|rooftop",,,retail,yes,no,Prefers filter coffee,',
].join("\n");

/**
 * Import is deliberately additive: a row that matches somebody on file is
 * counted and left alone rather than overwritten, because an old spreadsheet
 * rarely knows more than the live record does.
 */
export function CustomerImportDialog() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [summary, setSummary] = useState<{
    created: number;
    matched: number;
    skipped: number;
    problems: string[];
  } | null>(null);

  function open() {
    setError(null);
    setSummary(null);
    dialogRef.current?.showModal();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setSummary(null);
    try {
      const result = await importCustomersCsvAction(text);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSummary({
        created: result.created,
        matched: result.matched,
        skipped: result.skipped,
        problems: result.problems,
      });
      setText("");
      router.refresh();
    } catch {
      setError("Could not import. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={open}>
        Import CSV
      </Button>
      <dialog
        ref={dialogRef}
        className="m-auto max-h-[90vh] w-[min(100%,46rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form className="space-y-4 p-5" onSubmit={onSubmit}>
          <div>
            <h2 className="font-semibold">Import customers from CSV</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              Upload a file or paste the rows. A header line is required; unknown columns are
              ignored and the money columns are never read, since those come from the bills.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
            >
              Choose a .csv file
            </Button>
            <Button type="button" variant="ghost" onClick={() => setText(TEMPLATE)} disabled={pending}>
              Use the example
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  setText(String(reader.result ?? ""));
                  setError(null);
                };
                reader.readAsText(file);
                e.target.value = "";
              }}
            />
          </div>

          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">CSV contents</span>
            <textarea
              className="ob-input mt-1 min-h-40 w-full font-mono text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              disabled={pending}
            />
          </label>

          {summary ? (
            <div className="rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3 text-sm">
              <p>
                {summary.created} added
                {summary.matched ? `, ${summary.matched} already on file and left alone` : ""}
                {summary.skipped ? `, ${summary.skipped} skipped` : ""}.
              </p>
              {summary.problems.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--ob-text-muted)]">
                  {summary.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
                Consent stays off unless a row says <span className="ob-num">yes</span> — a
                contact list is not a marketing permission.
              </p>
            </div>
          ) : null}

          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" loading={pending} disabled={!text.trim()}>
              {pending ? "Importing…" : "Import"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => dialogRef.current?.close()}
              disabled={pending}
            >
              {summary ? "Done" : "Cancel"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
