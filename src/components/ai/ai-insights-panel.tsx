"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  CalendarDays,
  Check,
  ClipboardList,
  Copy,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AI_INSIGHT_PROMPTS,
  PREWRITTEN_SUMMARIES,
  aiSummaryHint,
  type AiInsightData,
  type AiInsightKind,
  type AiInsightPrompt,
  type PrewrittenSummary,
  type InsightResult,
} from "@/lib/ai/insights";
import { requestInsight } from "@/lib/ai/request-insight";

/** Which icon each summary card wears. */
const SUMMARY_ICONS: Partial<Record<AiInsightKind, typeof CalendarDays>> = {
  today_report: CalendarDays,
  week_summary: CalendarDays,
  month_summary: CalendarDays,
  suggestions: ClipboardList,
};

/**
 * The AI Insights tab.
 *
 * Four summary cards sit in a 2×2 grid and they arrive already written — today,
 * last week, last month, and the suggestions those imply. The page composes them
 * on the server from the same rows, so the tab opens with an answer on screen and
 * a card only has to be read, not run. Everything narrower than that stays a
 * button underneath, and those still take the drafting trip.
 *
 * Both call `requestInsight`, which today composes the brief in the browser
 * from the rows this workspace already loaded. That single function is where the
 * Python service gets wired in — the panel, its pending state and its result
 * shape already assume a round trip.
 */
export function AiInsightsPanel({
  data,
  prewritten,
}: {
  data: AiInsightData;
  /** The four cards' briefs, already composed on the server. */
  prewritten: Record<PrewrittenSummary, InsightResult>;
}) {
  const reduceMotion = useReducedMotion();
  const [pending, setPending] = useState<AiInsightKind | "ask" | null>(null);
  const [result, setResult] = useState<InsightResult | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [copied, setCopied] = useState(false);
  /* Bumps on every draft so the reveal animation replays for a new brief
     instead of only running for the first one. */
  const [draft, setDraft] = useState(0);

  const busy = pending !== null;

  async function run(kind: AiInsightKind) {
    setPending(kind);
    setError(null);
    setCopied(false);
    const response = await requestInsight({ data, kind });
    setPending(null);
    if (response.ok) {
      setResult(response.result);
      setAsked(null);
      setDraft((n) => n + 1);
    } else {
      setError(response.message);
    }
  }

  /** A pre-written card needs no round trip — opening it is instant. */
  function openPrewritten(brief: InsightResult) {
    setError(null);
    setCopied(false);
    setResult(brief);
    setAsked(null);
    setDraft((n) => n + 1);
  }

  async function ask(text: string) {
    setPending("ask");
    setError(null);
    setCopied(false);
    const response = await requestInsight({ data, question: text });
    setPending(null);
    if (response.ok) {
      setResult(response.result);
      setAsked(response.question);
      setDraft((n) => n + 1);
    } else {
      setError(response.message);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(toPlainText(data.brandName, result));
      setCopied(true);
    } catch {
      /* A blocked clipboard is not a failed brief — the text is on screen. */
    }
  }

  const cards = PREWRITTEN_SUMMARIES.flatMap((kind) => {
    const prompt = AI_INSIGHT_PROMPTS.find((item) => item.kind === kind);
    return prompt ? [{ kind, prompt, brief: prewritten[kind] }] : [];
  });
  const briefs = AI_INSIGHT_PROMPTS.filter((prompt) => prompt.group === "brief");

  return (
    <div className="space-y-4">
      <section aria-labelledby="ob-ai-summaries" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ob-ai-summaries" className="font-display text-lg font-semibold">
            AI summaries
          </h2>
          <Badge tone="demo">Written from these rows — no model wired yet</Badge>
        </div>
        <p className="max-w-3xl text-sm text-[var(--ob-text-muted)]">
          Every figure is summed from bills, payments, customers, reviews and
          shelf positions this workspace already holds, and the four cards below
          are composed the moment the page loads.
        </p>

        {/* Two rows of two, each one already written. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map(({ kind, prompt, brief }) => (
            <SummaryCard
              key={kind}
              prompt={prompt}
              brief={brief}
              hint={aiSummaryHint(kind, data)}
              chosen={!busy && asked === null && result?.kind === kind}
              onOpen={() => openPrewritten(brief)}
            />
          ))}
        </div>
      </section>

      <Card>
        <h2 className="font-display text-lg font-semibold">More AI briefs</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ob-text-muted)]">
          Ten narrower questions for mid-shift — one window, one angle each.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {briefs.map((prompt) => {
            const active = pending === prompt.kind;
            const chosen = result?.kind === prompt.kind && !busy && asked === null;
            return (
              <button
                key={prompt.kind}
                type="button"
                onClick={() => void run(prompt.kind)}
                disabled={busy}
                className="ob-press ob-card flex min-h-[4.5rem] flex-col items-start gap-1 p-3 text-left transition hover:border-[var(--ob-line-hover)] hover:bg-[var(--ob-tint-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : chosen ? (
                    <Check className="h-3.5 w-3.5 text-[var(--ob-primary)]" aria-hidden />
                  ) : null}
                  {prompt.label}
                </span>
                <span className="text-xs text-[var(--ob-text-muted)]">{prompt.blurb}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold">Ask in your own words</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ob-text-muted)]">
          The question is matched to whichever brief can actually answer it, then
          that brief runs on this workspace’s rows.
        </p>

        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim() && !busy) void ask(question.trim());
          }}
        >
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask in your own words: “what will we run out of?”"
            aria-label="Ask a question about this business"
            className="min-w-0 flex-1"
          />
          <Button type="submit" loading={busy} disabled={!question.trim()}>
            Generate
          </Button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {AI_INSIGHT_PROMPTS.slice(0, 4).map((prompt) => (
            <button
              key={prompt.kind}
              type="button"
              onClick={() => {
                setQuestion(prompt.example);
                if (!busy) void ask(prompt.example);
              }}
              disabled={busy}
              className="ob-press rounded-full border border-[var(--ob-border)] px-2.5 py-1 text-xs text-[var(--ob-text-muted)] hover:border-[var(--ob-line-hover)] hover:text-[var(--ob-text)] disabled:opacity-50"
            >
              {prompt.example}
            </button>
          ))}
        </div>
      </Card>

      {error ? (
        <Card className="border-[var(--ob-danger)]">
          <p className="text-sm text-[var(--ob-danger)]" role="alert">
            {error}
          </p>
        </Card>
      ) : null}

      {busy ? <DraftFrame label={pending === "ask" ? question : (pending ? labelFor(pending) : "")} /> : null}

      {!busy && result ? (
        <Brief
          key={draft}
          result={result}
          asked={asked}
          reduceMotion={Boolean(reduceMotion)}
          copied={copied}
          onCopy={() => void copy()}
        />
      ) : null}

      {!busy && !result && !error ? (
        <p className="text-sm text-[var(--ob-text-muted)]">
          The four summaries above are already written — open one to read it in
          full, or run a narrower brief.
        </p>
      ) : null}
    </div>
  );
}

function labelFor(kind: AiInsightKind): string {
  return AI_INSIGHT_PROMPTS.find((prompt) => prompt.kind === kind)?.label ?? kind;
}

/**
 * One pre-written summary card: the window it reads, the line a merchant would
 * read first, and the three numbers behind it. The button only opens the full
 * brief below — nothing is generated on click, because it is already here.
 */
function SummaryCard({
  prompt,
  brief,
  hint,
  chosen,
  onOpen,
}: {
  prompt: AiInsightPrompt;
  brief: InsightResult;
  hint: string;
  chosen: boolean;
  onOpen: () => void;
}) {
  const Icon = SUMMARY_ICONS[prompt.kind] ?? Sparkles;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2 font-display text-[15px] font-semibold">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--ob-line)] bg-[var(--ob-tint-wash)]">
            <Icon className="h-3.5 w-3.5 text-[var(--ob-primary)]" aria-hidden />
          </span>
          {prompt.label}
        </span>
        {chosen ? (
          <Check className="mt-1.5 h-4 w-4 text-[var(--ob-primary)]" aria-hidden />
        ) : null}
      </div>

      <p className="mt-auto text-[15px] font-medium leading-snug">{brief.headline}</p>

      <dl className="grid grid-cols-3 gap-2">
        {brief.metrics.slice(0, 3).map((metric) => (
          <div
            key={metric.label}
            className="rounded-[var(--ob-radius-md)] border border-[var(--ob-line)] bg-[var(--ob-tint-wash)] px-2 py-1.5"
          >
            <dt className="truncate text-[10px] uppercase tracking-wide text-[var(--ob-text-muted)]">
              {metric.label}
            </dt>
            <dd className="ob-num mt-0.5 text-[13px] font-semibold">{metric.value}</dd>
          </div>
        ))}
      </dl>

      <p className="border-t border-[var(--ob-line)] pt-2 text-xs text-[var(--ob-text-muted)]">
        {hint}
      </p>

      <Button
        variant="secondary"
        onClick={onOpen}
        className="self-start px-4 py-2 text-[13px]"
      >
        {chosen ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        )}
        {chosen ? "Open below" : "Read full brief"}
      </Button>
    </Card>
  );
}

function DraftFrame({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
    <Card>
      <p className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--ob-primary)]" aria-hidden />
        Drafting{label ? ` ${label}` : ""}…
      </p>
      <div className="mt-3 space-y-2">
        {[100, 92, 78, 86].map((width, index) => (
          <div
            key={index}
            className="h-3 animate-pulse rounded-full bg-[var(--ob-surface-muted)]"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>
    </Card>
    </div>
  );
}

function Brief({
  result,
  asked,
  reduceMotion,
  copied,
  onCopy,
}: {
  result: InsightResult;
  asked: string | null;
  reduceMotion: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  const reveal = (index: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 6 },
          animate: { opacity: 1, y: 0 },
          transition: { delay: index * 0.05, duration: 0.28 },
        };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold">{result.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--ob-text-muted)]">
            <Badge tone="neutral">{result.window}</Badge>
            {asked ? <span>Answered: “{asked}”</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="ob-press inline-flex items-center gap-1.5 rounded-full border border-[var(--ob-border)] px-3 py-1.5 text-xs font-medium hover:border-[var(--ob-line-hover)]"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy brief"}
        </button>
      </div>

      <motion.p
        {...reveal(0)}
        className="mt-3 max-w-3xl text-[17px] font-medium leading-snug"
      >
        {result.headline}
      </motion.p>

      {result.metrics.length ? (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {result.metrics.map((metric, index) => (
            <motion.div
              key={metric.label}
              {...reveal(index + 1)}
              className="rounded-[var(--ob-radius-md)] border border-[var(--ob-line)] bg-[var(--ob-tint-wash)] px-3 py-2"
            >
              <dt className="ob-label-quiet">{metric.label}</dt>
              <dd className="ob-num mt-1 text-[15px] font-semibold">{metric.value}</dd>
            </motion.div>
          ))}
        </dl>
      ) : null}

      {result.findings.length ? (
        <div className="mt-4 space-y-2">
          {result.findings.map((line, index) => (
            <motion.p
              key={`${line}-${index}`}
              {...reveal(index + 2)}
              className="max-w-3xl text-sm leading-relaxed text-[var(--ob-text-muted)]"
            >
              {line}
            </motion.p>
          ))}
        </div>
      ) : null}

      {result.actions.length ? (
        <div className="mt-4">
          <p className="ob-label-quiet">What to do about it</p>
          <ul className="mt-2 space-y-1.5">
            {result.actions.map((action, index) => (
              <motion.li
                key={`${action}-${index}`}
                {...reveal(index + 3)}
                className="flex gap-2 text-sm"
              >
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ob-primary)]" />
                <span className="max-w-3xl">{action}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.caveat ? (
        <p className="ob-fineprint mt-4 max-w-3xl border-t border-[var(--ob-line)] pt-3">
          {result.caveat}
        </p>
      ) : null}
    </Card>
  );
}

/** Plain-text form for forwarding to a person or a WhatsApp message. */
function toPlainText(brandName: string, result: InsightResult): string {
  return [
    `${result.title} — ${brandName} (${result.window})`,
    "",
    result.headline,
    "",
    ...result.metrics.map((metric) => `${metric.label}: ${metric.value}`),
    "",
    ...result.findings.map((line) => `• ${line}`),
    "",
    "What to do about it",
    ...result.actions.map((action) => `- ${action}`),
    result.caveat ? `\n${result.caveat}` : "",
  ].join("\n");
}
