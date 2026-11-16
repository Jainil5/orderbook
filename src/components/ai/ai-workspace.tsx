"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { INTEGRATIONS_HREF } from "@/lib/ai/links";
import type { AiSeverity } from "@/lib/ai/types";
import type {
  AiChannelStatus,
  AiInsight,
  AiWorkspaceView,
  AssistantAnswer,
} from "@/lib/ai/types";
import type { AiActionResult, AssistantResult } from "@/services/ai-actions";
import {
  acceptProposalAction,
  askAssistantAction,
  createTaskFromInsightAction,
  dismissProposalAction,
  setAutomationEnabledAction,
} from "@/services/ai-actions";

type TabId = "assistant" | "insights" | "recommendations" | "automations" | "channels";

const TABS: { id: TabId; label: string }[] = [
  { id: "assistant", label: "Assistant" },
  { id: "insights", label: "Insights" },
  { id: "recommendations", label: "Recommendations" },
  { id: "automations", label: "Automations" },
  { id: "channels", label: "Channels" },
];

const SEVERITY: Record<
  AiSeverity,
  { tone: "danger" | "warning" | "success" | "neutral"; label: string }
> = {
  critical: { tone: "danger", label: "Needs action" },
  warning: { tone: "warning", label: "Watch" },
  opportunity: { tone: "success", label: "Opportunity" },
  info: { tone: "neutral", label: "Note" },
};

const KIND_LABELS: Record<AiInsight["kind"], string> = {
  receivables: "Receivables",
  quotes: "Quotes",
  inventory: "Inventory",
  margin: "Margin",
  sales: "Sales",
  tasks: "Tasks",
  appointments: "Bookings",
  staffing: "Staffing",
  expenses: "Expenses",
  procurement: "Procurement",
  cash: "Cash",
};

const CHANNEL_STATE: Record<
  AiChannelStatus["status"],
  { tone: "neutral" | "success" | "warning" | "danger"; label: string }
> = {
  not_configured: { tone: "neutral", label: "Not configured" },
  disconnected: { tone: "neutral", label: "Not connected" },
  connected: { tone: "success", label: "Connected" },
  error: { tone: "warning", label: "Needs attention" },
};

export function AiWorkspace({ view }: { view: AiWorkspaceView }) {
  const [tab, setTab] = useState<TabId>("assistant");
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<AiActionResult | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const decided = new Map(
    view.handled
      .filter((proposal) => proposal.ruleId === null)
      .map((proposal) => [proposal.id, proposal.status]),
  );
  const inbox = view.proposals.filter((p) => p.ruleId !== null);
  const inboxHistory = view.handled.filter((p) => p.ruleId !== null);

  function report(result: AiActionResult) {
    setStatus(result);
  }

  function run(id: string, work: () => Promise<AiActionResult>) {
    setBusyId(id);
    setStatus(null);
    startTransition(async () => {
      try {
        report(await work());
      } catch {
        report({
          ok: false,
          message: "The request did not go through. Nothing was created.",
        });
      } finally {
        setBusyId(null);
      }
    });
  }

  function ask(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) {
      setAskError("Ask a question first.");
      return;
    }
    setAsking(true);
    setAskError(null);
    startTransition(async () => {
      try {
        const result: AssistantResult = await askAssistantAction(trimmed);
        if (result.ok) {
          setAnswer(result.answer);
        } else {
          setAskError(result.message);
          setAnswer(null);
        }
      } catch {
        setAskError("The assistant could not answer right now. Nothing was sent.");
      } finally {
        setAsking(false);
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={view.provider.status === "configured" ? "success" : "demo"}>
            {view.provider.label}
          </Badge>
          <Badge tone="neutral">
            {view.channels.filter((channel) => channel.status === "connected").length}{" "}
            of {view.channels.length} channels connected
          </Badge>
          <span className="text-xs text-[var(--ob-text-muted)]">
            Computed from {view.brandName}&rsquo;s own records at{" "}
            {new Date(view.generatedAt).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </span>
        </div>
        <p className="text-sm text-[var(--ob-text-secondary)]">
          Every answer, insight and proposal below comes from a deterministic read
          of this workspace &mdash; the orders, products, tasks, bookings and
          balances you can open yourself. Nothing is generated from a language
          model, nothing is sent anywhere, and no automation writes a record
          without you accepting it first.
        </p>
        {view.provider.status === "not_configured" ? (
          <p className="text-xs text-[var(--ob-text-muted)]">
            Env vars checked (names only, values never read by the browser):{" "}
            {view.provider.envNames.join(", ")}. Unset:{" "}
            {view.provider.missing.join(", ") || "none"}.
          </p>
        ) : null}
      </Card>

      <Tabs value={tab} onChange={setTab} options={TABS} label="OrderBook AI sections" />

      {status ? (
        <div
          role="alert"
          aria-live="polite"
          className={
            status.ok
              ? "rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] bg-emerald-50 px-4 py-3 text-sm text-[var(--ob-text)]"
              : "rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] bg-red-50 px-4 py-3 text-sm text-[var(--ob-text)]"
          }
        >
          <span>{status.message}</span>
          {status.ok && status.href ? (
            <Link
              href={status.href}
              className="ml-2 text-xs font-medium text-[var(--ob-primary)] hover:underline"
            >
              Open it
            </Link>
          ) : null}
        </div>
      ) : null}

      {tab === "assistant" ? (
        <section className="space-y-3">
          <Card className="space-y-3">
            <form onSubmit={ask} className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about your own records, e.g. what is low on stock?"
                aria-label="Question for OrderBook AI"
                maxLength={300}
              />
              <Button type="submit" loading={asking || pending}>
                Ask
              </Button>
            </form>
            <p className="text-xs text-[var(--ob-text-muted)]">
              Answers come from the local insight engine reading this workspace.
              If a question is outside what it can compute, it says so instead of
              guessing.
            </p>
          </Card>

          {askError ? (
            <p
              role="alert"
              className="rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] bg-red-50 px-4 py-3 text-sm"
            >
              {askError}
            </p>
          ) : null}

          {asking ? (
            <Card>
              <p className="text-sm text-[var(--ob-text-muted)]">
                Reading your records&hellip;
              </p>
            </Card>
          ) : null}

          {answer && !asking ? (
            <Card className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={answer.source === "engine" ? "demo" : "success"}>
                  {answer.source === "engine" ? "Local engine" : "Model"}
                </Badge>
                <span className="text-xs text-[var(--ob-text-muted)]">
                  {answer.engineLabel}
                </span>
                {answer.intent ? <Badge>{answer.intent}</Badge> : null}
              </div>
              <p className="text-sm leading-relaxed text-[var(--ob-text)]">
                {answer.text}
              </p>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
                  Based on
                </p>
                {answer.grounding.length ? (
                  <ul className="mt-2 divide-y divide-[var(--ob-border)]">
                    {answer.grounding.map((row) => (
                      <li key={`${row.label}-${row.value}`} className="py-2">
                        <Link
                          href={row.href}
                          className="flex items-baseline justify-between gap-3 text-sm hover:text-[var(--ob-primary)]"
                        >
                          <span className="min-w-0 truncate">{row.label}</span>
                          <span className="shrink-0 font-medium text-[var(--ob-text-secondary)]">
                            {row.value}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
                    No records matched, so there is nothing to cite.
                  </p>
                )}
              </div>
              {answer.suggestions.length ? (
                <div className="flex flex-wrap gap-2">
                  {answer.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setQuestion(suggestion)}
                      className="rounded-full border border-[var(--ob-border)] bg-[var(--ob-surface)] px-3 py-1.5 text-xs text-[var(--ob-text-secondary)] hover:bg-[var(--ob-surface-muted)]"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}

          {!answer && !askError && !asking ? (
            <EmptyState
              title="Ask a question about this workspace"
              description="Sales, best sellers, margin, money owed, stock, tasks due, today's bookings, who is on shift, this month's expenses. Anything else, the engine will tell you it cannot answer rather than invent an answer."
            />
          ) : null}
        </section>
      ) : null}

      {tab === "insights" ? (
        <section className="space-y-3">
          {view.insights.length === 0 ? (
            <EmptyState
              title="Nothing to flag in these records"
              description="The engine only speaks when a rule matches real rows — stock levels, unpaid balances, silent quotes, overdue tasks. With no matching data it stays quiet."
            />
          ) : (
            <ol className="space-y-3">
              {view.insights.map((insight, index) => {
                const severity = SEVERITY[insight.severity];
                return (
                  <li key={insight.id} className="ob-stagger">
                    <Card className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--ob-text-muted)]">
                            {index + 1}
                          </span>
                          <Badge tone={severity.tone}>{severity.label}</Badge>
                          <Badge>{KIND_LABELS[insight.kind]}</Badge>
                        </div>
                        {insight.metric ? (
                          <span className="text-sm font-semibold text-[var(--ob-text-secondary)]">
                            {insight.metric.label}: {insight.metric.value}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-sm font-semibold">{insight.headline}</h3>
                      <p className="text-sm text-[var(--ob-text-muted)]">
                        {insight.detail}
                      </p>
                      {insight.evidence.length ? (
                        <ul className="grid gap-1 sm:grid-cols-2">
                          {insight.evidence.map((row) => (
                            <li
                              key={`${insight.id}-${row.label}-${row.value}`}
                              className="rounded-[var(--ob-radius-md)] bg-[var(--ob-surface-muted)] px-3 py-2 text-xs"
                            >
                              {row.href ? (
                                <Link
                                  href={row.href}
                                  className="flex items-baseline justify-between gap-2 hover:text-[var(--ob-primary)]"
                                >
                                  <span className="min-w-0 truncate">{row.label}</span>
                                  <span className="shrink-0 font-medium">
                                    {row.value}
                                  </span>
                                </Link>
                              ) : (
                                <span className="flex items-baseline justify-between gap-2">
                                  <span className="min-w-0 truncate">{row.label}</span>
                                  <span className="shrink-0 font-medium">
                                    {row.value}
                                  </span>
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <Link
                        href={insight.actionHref}
                        className="inline-flex text-xs font-medium text-[var(--ob-primary)] hover:underline"
                      >
                        {insight.actionLabel}
                      </Link>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ) : null}

      {tab === "recommendations" ? (
        <section className="space-y-3">
          <p className="text-xs text-[var(--ob-text-muted)]">
            Each one turns into a single OrderBook task when you accept it. They
            are ordered by the same ranking as the insights, and none of them
            contacts a customer.
          </p>
          {view.recommendations.length === 0 ? (
            <EmptyState
              title="No next actions to suggest"
              description="Recommendations only exist when an insight has a concrete action attached. Right now no rule had anything to say."
            />
          ) : (
            <ul className="space-y-3">
              {view.recommendations.map((rec) => {
                const key = `rec-${rec.insightId}`;
                const outcome = decided.get(key);
                return (
                  <li key={rec.id} className="ob-stagger">
                    <Card className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{KIND_LABELS[rec.kind]}</Badge>
                        {outcome === "accepted" ? (
                          <Badge tone="success">Created</Badge>
                        ) : outcome === "rejected" ? (
                          <Badge tone="neutral">Dismissed</Badge>
                        ) : null}
                      </div>
                      <h3 className="text-sm font-semibold">{rec.title}</h3>
                      <p className="text-sm text-[var(--ob-text-muted)]">{rec.why}</p>
                      <p className="text-xs text-[var(--ob-text-secondary)]">
                        {rec.record.kind === "task"
                          ? `Creates a ${rec.record.priority} priority task: &ldquo;${rec.record.title}&rdquo;`
                          : `Creates a note: &ldquo;${rec.record.title}&rdquo;`}
                      </p>
                      <p className="text-xs text-[var(--ob-text-muted)]">
                        {rec.deliveryNote}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {outcome ? null : (
                          <Button
                            variant="primary"
                            disabled={busyId === key}
                            loading={busyId === key && pending}
                            onClick={() =>
                              run(key, () => createTaskFromInsightAction(rec.insightId))
                            }
                          >
                            Create task from this
                          </Button>
                        )}
                        {outcome === "accepted" && rec.href ? (
                          <Link
                            href={rec.href}
                            className="text-xs font-medium text-[var(--ob-primary)] hover:underline"
                          >
                            {rec.linkLabel}
                          </Link>
                        ) : null}
                        {outcome ? null : (
                          <Button
                            variant="ghost"
                            disabled={busyId === key}
                            onClick={() => run(key, () => dismissProposalAction(key))}
                          >
                            Dismiss
                          </Button>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "automations" ? (
        <section className="space-y-4">
          <Card className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">Confirm before write</Badge>
              <Badge tone="demo">Proposes only</Badge>
            </div>
            <p className="text-sm text-[var(--ob-text-muted)]">
              Rules watch the workspace and fill an inbox. Turning one on changes
              what gets proposed, nothing else: every proposal still needs your
              accept before a record exists. Settings are stored per brand in the
              workspace settings table.
            </p>
          </Card>

          <ul className="space-y-3">
            {view.rules.map((rule) => {
              const enabled = view.automationState[rule.id] === true;
              return (
                <li key={rule.id}>
                  <Card className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-sm font-semibold">{rule.name}</h3>
                        <p className="text-xs text-[var(--ob-text-muted)]">
                          <span className="font-medium text-[var(--ob-text-secondary)]">
                            When:
                          </span>{" "}
                          {rule.trigger}
                        </p>
                        <p className="text-xs text-[var(--ob-text-muted)]">
                          <span className="font-medium text-[var(--ob-text-secondary)]">
                            Proposes:
                          </span>{" "}
                          {rule.creates}
                        </p>
                        <p className="text-xs text-[var(--ob-text-muted)]">
                          {rule.deliveryNote}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          aria-label={`${rule.name} ${enabled ? "on" : "off"}`}
                          disabled={busyId === rule.id}
                          onClick={() =>
                            run(rule.id, () =>
                              setAutomationEnabledAction(rule.id, !enabled),
                            )
                          }
                          className={
                            enabled
                              ? "ob-touch-target inline-flex h-8 w-14 items-center justify-end rounded-full bg-[var(--ob-primary)] px-1.5 text-xs font-medium text-white"
                              : "ob-touch-target inline-flex h-8 w-14 items-center justify-start rounded-full bg-[var(--ob-surface-muted)] px-1.5 text-xs font-medium text-[var(--ob-text-muted)]"
                          }
                        >
                          {enabled ? "On" : "Off"}
                        </button>
                        <Link
                          href={rule.href}
                          className="text-xs font-medium text-[var(--ob-primary)] hover:underline"
                        >
                          {rule.linkLabel}
                        </Link>
                      </div>
                    </div>
                    {rule.requiresConfirmation ? (
                      <p className="text-[11px] uppercase tracking-wide text-[var(--ob-text-muted)]">
                        Always requires your confirmation
                      </p>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Proposals inbox</h2>
            {inbox.length === 0 ? (
              <EmptyState
                title="Inbox empty"
                description="No enabled rule found anything to propose right now. Proposals appear here only when the data actually matches a rule."
              />
            ) : (
              <ul className="space-y-3">
                {inbox.map((proposal) => (
                  <li key={proposal.id} className="ob-stagger">
                    <Card className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {proposal.ruleName ? (
                          <Badge tone="neutral">{proposal.ruleName}</Badge>
                        ) : null}
                        <Badge tone="warning">Awaiting your decision</Badge>
                      </div>
                      <h3 className="text-sm font-semibold">{proposal.title}</h3>
                      <p className="text-sm text-[var(--ob-text-muted)]">
                        {proposal.whatWillHappen}
                      </p>
                      <p className="text-xs text-[var(--ob-text-muted)]">
                        {proposal.deliveryNote}
                      </p>
                      {proposal.evidence.length ? (
                        <ul className="grid gap-1 sm:grid-cols-2">
                          {proposal.evidence.map((row) => (
                            <li
                              key={`${proposal.id}-${row.label}`}
                              className="rounded-[var(--ob-radius-md)] bg-[var(--ob-surface-muted)] px-3 py-2 text-xs"
                            >
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="min-w-0 truncate">{row.label}</span>
                                <span className="shrink-0 font-medium">
                                  {row.value}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          disabled={busyId === proposal.id}
                          loading={busyId === proposal.id && pending}
                          onClick={() =>
                            run(proposal.id, () =>
                              acceptProposalAction(proposal.id),
                            )
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busyId === proposal.id}
                          onClick={() =>
                            run(proposal.id, () => dismissProposalAction(proposal.id))
                          }
                        >
                          Reject
                        </Button>
                        <Link
                          href={proposal.actionHref}
                          className="text-xs font-medium text-[var(--ob-primary)] hover:underline"
                        >
                          {proposal.actionLabel}
                        </Link>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}

            {inboxHistory.length ? (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
                  Your recent decisions
                </h3>
                <ul className="space-y-2">
                  {inboxHistory.map((proposal) => (
                    <li
                      key={proposal.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--ob-radius-md)] border border-dashed border-[var(--ob-border)] px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate text-[var(--ob-text-secondary)]">
                        {proposal.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge
                          tone={proposal.status === "accepted" ? "success" : "neutral"}
                        >
                          {proposal.status === "accepted" ? "Accepted" : "Rejected"}
                        </Badge>
                        {proposal.status === "accepted" && proposal.outcomeHref ? (
                          <Link
                            href={proposal.outcomeHref}
                            className="font-medium text-[var(--ob-primary)] hover:underline"
                          >
                            {proposal.outcomeLabel ?? "Open"}
                          </Link>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "channels" ? (
        <section className="space-y-3">
          <Card className="space-y-1">
            <p className="text-sm text-[var(--ob-text-secondary)]">
              WhatsApp, Gmail and Google Calendar delivery is a separate
              integration area with its own OAuth and credentials &mdash; the
              statuses below are that area&rsquo;s live state, read here so you
              can see what exists. OrderBook AI does not use those channels
              itself: it only ever creates records inside OrderBook &mdash;
              tasks and notes &mdash; and never sends a message, email or
              calendar invite on your behalf.
            </p>
            <Link
              href={INTEGRATIONS_HREF}
              className="inline-flex text-xs font-medium text-[var(--ob-primary)] hover:underline"
            >
              Open integrations
            </Link>
          </Card>
          <ul className="space-y-3">
            {view.channels.map((channel) => (
              <li key={channel.id}>
                <Card className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{channel.label}</h3>
                    <Badge tone={CHANNEL_STATE[channel.status].tone}>
                      {CHANNEL_STATE[channel.status].label}
                    </Badge>
                  </div>
                  <p className="text-sm text-[var(--ob-text-muted)]">
                    {channel.summary}
                  </p>
                  <p className="text-xs text-[var(--ob-text-secondary)]">
                    <span className="font-medium">Unlocks once connected:</span>{" "}
                    {channel.unlocks}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
