import {
  UNROUTED_HINT,
  generateInsight,
  isAiInsightKind,
  routeQuestion,
  type AiInsightData,
  type AiInsightKind,
  type InsightResult,
} from "@/lib/ai/insights";

export type AiInsightRequest = {
  data: AiInsightData;
  /** Set by a prompt button. */
  kind?: AiInsightKind;
  /** Set by the free-text box; routed to a brief when it can be placed. */
  question?: string;
};

export type AiInsightResponse =
  | { ok: true; result: InsightResult; question: string | null }
  | { ok: false; message: string };

/**
 * How long the local composer takes to "think".
 *
 * It takes a few milliseconds; the wait is here so the panel already has the
 * shape a real backend call needs — pending, success, failure — instead of the
 * swap adding those states later.
 */
const DRAFT_DELAY_MS = 650;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * **This is the one call site the Python service replaces.**
 *
 * Everything the briefs need is already in `AiInsightData`, so wiring the real
 * backend is a body swap here and nothing else changes:
 *
 * ```ts
 * const res = await fetch("/api/ai/insights", {
 *   method: "POST",
 *   headers: { "content-type": "application/json" },
 *   body: JSON.stringify(request),
 * });
 * return (await res.json()) as AiInsightResponse;
 * ```
 *
 * The route handler would forward `{ brand, kind, question, data }` to the
 * Python service and return its `InsightResult` unchanged — the contract lives
 * in `src/lib/ai/insights.ts`, which stays useful as the deterministic baseline
 * a model can be measured against.
 */
export async function requestInsight(
  request: AiInsightRequest,
): Promise<AiInsightResponse> {
  const question = request.question?.trim() ?? "";
  let kind = request.kind ?? null;
  let routedFromQuestion = false;

  if (question) {
    kind = routeQuestion(question);
    routedFromQuestion = true;
    if (!kind) {
      await wait(DRAFT_DELAY_MS);
      return { ok: false, message: UNROUTED_HINT };
    }
  }

  if (!kind || !isAiInsightKind(kind)) {
    return { ok: false, message: "Pick one of the briefs below to generate a report." };
  }

  await wait(DRAFT_DELAY_MS);
  return {
    ok: true,
    result: generateInsight(kind, request.data),
    question: routedFromQuestion ? question : null,
  };
}
