/**
 * The only I/O in the AI area.
 *
 * Everything else (`context.ts`, `insight-engine.ts`, `recommendations.ts`,
 * `assistant.ts`, `automations.ts`) is pure and takes data as an argument. This
 * module gathers the workspace's own records through the same demo loaders the
 * Manager pages use, then feeds them to the grounding source. Server-only: it
 * reads the CSV store and env vars, and no client component may
 * import it — the browser never needs the numbers, only the view this returns.
 */

import { loadBusinessData } from "@/lib/business/registry";
import { getDemoBrandPack } from "@/lib/demo/brands";
import {
  listDemoCustomers,
  listDemoOrderItemsForOrders,
  listDemoOrders,
  listDemoProductsMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import { ASSISTANT_PROMPTS } from "./assistant";
import {
  buildAutomationProposals,
  partitionProposals,
  resolveAutomationState,
  AUTOMATION_RULES,
} from "./automations";
import { buildBusinessContext, type BusinessContext } from "./context";
import { buildInsights } from "./insight-engine";
import { buildRecommendations, toProposal } from "./recommendations";
import { readAiPrefs } from "./prefs-store";
import { getAiProvider } from "./provider";
import { buildChannelStatuses } from "./channels";
import type {
  AiActionProposal,
  AiInsight,
  AiPrefsState,
  AiRecommendation,
  AiWorkspaceView,
} from "./types";

/** Everything the AI area can say, derived from one load of the workspace. */
export type AiModel = {
  ctx: BusinessContext;
  prefs: AiPrefsState;
  insights: AiInsight[];
  recommendations: AiRecommendation[];
  /** Rule proposals plus recommendation proposals, decisions applied. */
  pending: AiActionProposal[];
  handled: AiActionProposal[];
};

async function loadAiBusinessContext(
  code: DemoBrandCode,
  now: Date,
): Promise<BusinessContext> {
  const pack = getDemoBrandPack(code);
  const [ops, business, orders, orderItems, products, customers, staff] =
    await Promise.all([
      loadDemoOperations(code),
      loadBusinessData(code),
      listDemoOrders(undefined, code),
      listDemoOrderItemsForOrders(code),
      listDemoProductsMerged({}, code),
      listDemoCustomers(undefined, code),
      listDemoStaff(code),
    ]);

  return buildBusinessContext(
    {
      brandCode: code,
      brandName: pack.brand.name,
      currencyCode: pack.settings.currency_code,
      orders,
      orderItems,
      products,
      customers,
      tasks: ops.tasks,
      appointments: ops.appointments,
      shifts: ops.shifts,
      staff,
      expenses: business.expenses,
      purchaseOrders: business.purchaseOrders,
      suppliers: business.suppliers,
      cashMovements: business.cashMovements,
      cashSessions: business.cashSessions,
      leave: business.leave,
    },
    now,
  );
}

/**
 * Recomputed on every request: proposals are a function of the data, so there
 * is no proposal table to keep in sync. Only human decisions persist (the
 * `brand_settings` row), which is why accepting twice cannot create the same task twice.
 */
export async function loadAiModel(
  brandCode: string,
  now: Date = new Date(),
): Promise<AiModel> {
  const code = toDemoBrandCode(brandCode);
  const ctx = await loadAiBusinessContext(code, now);
  const prefs = await readAiPrefs(code);

  const insights = buildInsights(ctx);
  const recommendations = buildRecommendations(ctx, insights);

  const computed = [
    ...buildAutomationProposals(ctx, prefs),
    ...recommendations.map((rec) => toProposal(rec, now)),
  ];
  const seen = new Set<string>();
  const unique = computed.filter((proposal) => {
    if (seen.has(proposal.id)) return false;
    seen.add(proposal.id);
    return true;
  });

  const inbox = partitionProposals(unique, prefs);
  return {
    ctx,
    prefs,
    insights,
    recommendations,
    pending: inbox.pending,
    handled: inbox.handled,
  };
}

/** One lookup used by `acceptProposalAction` — never trusts a client payload. */
export async function findProposalById(
  brandCode: string,
  proposalId: string,
  now: Date = new Date(),
): Promise<AiActionProposal | null> {
  if (!proposalId) return null;
  const model = await loadAiModel(brandCode, now);
  return (
    [...model.pending, ...model.handled].find((p) => p.id === proposalId) ?? null
  );
}

export async function loadAiWorkspaceView(
  brandCode: string,
  now: Date = new Date(),
): Promise<AiWorkspaceView> {
  const code = toDemoBrandCode(brandCode);
  const pack = getDemoBrandPack(code);
  const model = await loadAiModel(code, now);
  const provider = getAiProvider();

  return {
    brandName: pack.brand.name,
    currencyCode: pack.settings.currency_code,
    provider: {
      status: provider.status,
      label: provider.label,
      model: provider.model,
      envNames: provider.envNames,
      missing: provider.missing,
    },
    channels: await buildChannelStatuses(code),
    insights: model.insights,
    recommendations: model.recommendations,
    rules: AUTOMATION_RULES,
    automationState: resolveAutomationState(model.prefs),
    proposals: model.pending,
    handled: model.handled,
    assistantPrompts: ASSISTANT_PROMPTS,
    generatedAt: model.ctx.generatedAt,
  };
}

/** The grounding context alone, for the assistant action. */
export async function loadAiContextFor(
  brandCode: string,
  now: Date = new Date(),
): Promise<BusinessContext> {
  return loadAiBusinessContext(toDemoBrandCode(brandCode), now);
}
