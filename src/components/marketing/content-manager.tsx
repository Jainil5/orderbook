"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  CONTENT_KIND_LABELS,
  CONTENT_OBJECTIVE_LABELS,
  REEL_DURATIONS,
  generateScript,
  scriptToPlainText,
  type ContentKind,
  type ContentObjective,
  type GeneratedScript,
} from "@/lib/marketing/script";
import { formatMoney } from "@/lib/format";
import { Copy, RefreshCw, Sparkles } from "lucide-react";

/** The subset of a product the writer needs; built server-side from the pack. */
export type ContentProductOption = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  image_url?: string | null;
};

/** A brief handed over from Growth Signals, already validated server-side. */
export type ContentInitialBrief = {
  productId: string;
  objective: ContentObjective;
  kind: ContentKind;
  seconds: number;
  notes: string;
};

const KIND_OPTIONS = (["reel", "image"] as const).map((id) => ({
  id,
  label: CONTENT_KIND_LABELS[id],
}));

const OBJECTIVE_OPTIONS = (["discount", "new_launch", "content"] as const).map(
  (id) => ({ id, label: CONTENT_OBJECTIVE_LABELS[id] }),
);

const DURATION_OPTIONS = REEL_DURATIONS.map((seconds) => ({
  id: String(seconds),
  label: `${seconds}s`,
}));

export function ContentManager({
  brandName,
  currencyCode,
  products,
  initialBrief,
}: {
  brandName: string;
  currencyCode: string;
  products: ContentProductOption[];
  initialBrief?: ContentInitialBrief | null;
}) {
  const handed =
    initialBrief && products.some((p) => p.id === initialBrief.productId)
      ? initialBrief
      : null;
  const [productId, setProductId] = useState(
    handed?.productId ?? products[0]?.id ?? "",
  );
  const [objective, setObjective] = useState<ContentObjective>(
    handed?.objective ?? "discount",
  );
  const [kind, setKind] = useState<ContentKind>(handed?.kind ?? "reel");
  const [seconds, setSeconds] = useState<string>(
    String(handed?.seconds ?? REEL_DURATIONS[0]),
  );
  const [notes, setNotes] = useState(handed?.notes ?? "");
  const [script, setScript] = useState<GeneratedScript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const product = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  );

  function onGenerate() {
    setError(null);
    setHint(null);
    if (!product) {
      setError("Pick a product first.");
      return;
    }
    try {
      setScript(
        generateScript({
          brandName,
          productName: product.name,
          category: product.category,
          price: product.price,
          objective,
          kind,
          seconds: Number(seconds),
          notes,
        }),
      );
    } catch (cause) {
      setScript(null);
      setError(
        cause instanceof Error ? cause.message : "Could not write a script.",
      );
    }
  }

  async function onCopy() {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(scriptToPlainText(script));
      setHint("Script copied — paste it into your phone to shoot.");
    } catch {
      setHint("Your browser blocked the clipboard. Select the text and copy it.");
    }
  }

  if (products.length === 0) {
    return (
      <EmptyState
        title="No products to feature"
        description="Content is built from your catalog. Add products under Products first."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card>
        <h2 className="font-semibold">What are we posting?</h2>
        <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
          Pick the product, say what the post should do, and write the brief in
          your own words.
        </p>
        {handed ? (
          <p className="mt-2 text-xs text-[var(--ob-leaf)]">
            Brief handed over from Growth Signals — change any of it before
            generating.
          </p>
        ) : null}

        <div className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Product</span>
            <select
              className="ob-input mt-1 w-full"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.category ? ` — ${p.category}` : ""}
                </option>
              ))}
            </select>
            {product ? (
              <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
                {formatMoney(product.price, currencyCode)}
              </span>
            ) : null}
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              label="Post type"
              value={kind}
              onChange={setKind}
              options={KIND_OPTIONS}
            />
            {kind === "reel" ? (
              <SegmentedControl
                label="Reel length"
                value={seconds}
                onChange={setSeconds}
                options={DURATION_OPTIONS}
              />
            ) : null}
          </div>

          {kind === "image" ? (
            <p className="text-xs text-[var(--ob-text-muted)]">
              A photo post carries no timing — one frame, one caption.
            </p>
          ) : null}

          <SegmentedControl
            label="Objective"
            value={objective}
            onChange={setObjective}
            options={OBJECTIVE_OPTIONS}
          />

          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">
              Notes for the writer
            </span>
            <textarea
              className="ob-input mt-1 min-h-24 w-full"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={240}
              placeholder="e.g. 30% off this pizza this weekend only, shot at the counter, keep it playful"
            />
            <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
              {notes.length}/240 — an offer only reads as an offer if you write
              one here.
            </span>
          </label>

          <Button type="button" onClick={onGenerate} className="w-full sm:w-auto">
            <Sparkles className="h-4 w-4" aria-hidden />
            Generate script
          </Button>
          {error ? (
            <p role="alert" className="text-xs text-[var(--ob-danger)]">
              {error}
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">
              {script ? script.title : "The script"}
            </h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              {script
                ? `${CONTENT_KIND_LABELS[script.kind]} · ${CONTENT_OBJECTIVE_LABELS[script.objective]}${script.kind === "reel" ? ` · ${script.seconds}s` : ""}`
                : "Nothing written yet."}
            </p>
          </div>
          {script ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="px-3 py-1.5 text-xs"
                onClick={onGenerate}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Another take
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="px-3 py-1.5 text-xs"
                onClick={onCopy}
              >
                <Copy className="h-4 w-4" aria-hidden />
                Copy
              </Button>
            </div>
          ) : null}
        </div>

        {hint ? (
          <p className="mt-2 text-xs text-[var(--ob-warning)]" role="status">
            {hint}
          </p>
        ) : null}

        {script ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="ob-label-quiet">Hook</p>
              <p className="mt-1 text-sm font-medium">{script.hook}</p>
            </div>

            <ol className="space-y-3">
              {script.shots.map((shot, index) => (
                <li key={`${shot.at}-${index}`} className="ob-row rounded-[var(--ob-radius-sm)] p-3">
                  <div className="flex items-center gap-2">
                    <Badge tone="demo">
                      {script.kind === "reel" ? `Shot ${index + 1}` : "Frame"}
                    </Badge>
                    <span className="text-xs text-[var(--ob-text-muted)]">
                      {shot.at}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{shot.headline}</p>
                  <p className="mt-1 text-sm text-[var(--ob-text-secondary)]">
                    {shot.action}
                  </p>
                  <p className="mt-1 text-sm italic text-[var(--ob-text-muted)]">
                    VO: {shot.voiceover}
                  </p>
                </li>
              ))}
            </ol>

            <div>
              <p className="ob-label-quiet">Call to action</p>
              <p className="mt-1 text-sm">{script.cta}</p>
            </div>

            <div>
              <p className="ob-label-quiet">Caption</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{script.caption}</p>
              <p className="mt-2 text-sm text-[var(--ob-leaf)]">
                {script.hashtags.join(" ")}
              </p>
            </div>

            <p className="ob-fineprint">
              Written by the demo&apos;s local script writer, so the screen works
              before a model is wired in. Nothing here is published.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              title="No script yet"
              description="Fill the brief on the left and press Generate script."
            />
          </div>
        )}
      </Card>
    </div>
  );
}
