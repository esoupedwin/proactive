import type { ModelUsage, ReportUsage } from "../types";

/**
 * OpenAI usage accounting for one report generation.
 *
 * Cost is an ESTIMATE computed from the price table below — exact for token
 * counts, but only as accurate as the maintained prices. OpenAI's dashboard
 * remains the billing source of truth.
 */

/** USD per 1M tokens. Update when OpenAI pricing changes, or override via
 *  the OPENAI_PRICING_JSON env var, e.g.
 *  {"gpt-5":{"input":1.25,"output":10},"gpt-5-mini":{"input":0.25,"output":2}} */
const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
};

/** USD per web_search tool call ($10 per 1k calls). */
const WEB_SEARCH_COST_PER_CALL = 0.01;

function pricingTable(): Record<string, { input: number; output: number }> {
  const raw = process.env.OPENAI_PRICING_JSON;
  if (!raw) return DEFAULT_PRICING;
  try {
    return { ...DEFAULT_PRICING, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PRICING;
  }
}

/** Longest-prefix match so dated ids like "gpt-5-mini-2026-01-01" resolve. */
export function pricingFor(
  model: string,
): { input: number; output: number } | null {
  const table = pricingTable();
  let best: { input: number; output: number } | null = null;
  let bestLength = 0;
  for (const [key, price] of Object.entries(table)) {
    if (model.startsWith(key) && key.length > bestLength) {
      best = price;
      bestLength = key.length;
    }
  }
  return best;
}

function tokenCost(
  price: { input: number; output: number },
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output
  );
}

/**
 * Cost of a single call. Null when the model's pricing is unknown.
 * Kept at 6dp so small per-step figures don't collapse to zero.
 */
export function estimateCallCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  webSearchCalls = 0,
): number | null {
  const price = pricingFor(model);
  if (!price) return null;
  const cost =
    tokenCost(price, inputTokens, outputTokens) +
    webSearchCalls * WEB_SEARCH_COST_PER_CALL;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Null if any used model has no known pricing (tokens still recorded). */
export function estimateCostUsd(
  byModel: Record<string, ModelUsage>,
  webSearchCalls: number,
): number | null {
  const { cost, unpricedModels } = estimatePartialCostUsd(
    byModel,
    webSearchCalls,
  );
  return unpricedModels.length > 0 ? null : cost;
}

/**
 * Cost of the priced portion of a usage record, plus the models that had no
 * configured price. Unlike `estimateCostUsd` this never collapses to null —
 * an all-time total stays useful when a single model is missing from the
 * table, at the cost of being a floor rather than an exact figure.
 */
export function estimatePartialCostUsd(
  byModel: Record<string, ModelUsage>,
  webSearchCalls: number,
): { cost: number; unpricedModels: string[] } {
  let cost = webSearchCalls * WEB_SEARCH_COST_PER_CALL;
  const unpricedModels: string[] = [];
  for (const [model, usage] of Object.entries(byModel)) {
    const price = pricingFor(model);
    if (!price) {
      unpricedModels.push(model);
      continue;
    }
    cost += tokenCost(price, usage.input_tokens, usage.output_tokens);
  }
  return { cost: Math.round(cost * 10_000) / 10_000, unpricedModels };
}

/** Adds one model's counters into an accumulating per-model table, in place. */
function foldModelUsage(
  byModel: Record<string, ModelUsage>,
  model: string,
  usage: ModelUsage,
): void {
  const entry = (byModel[model] ??= {
    calls: 0,
    input_tokens: 0,
    output_tokens: 0,
  });
  entry.calls += usage.calls;
  entry.input_tokens += usage.input_tokens;
  entry.output_tokens += usage.output_tokens;
}

/** Lifetime total across many stored usage records. */
export interface UsageTotals extends ReportUsage {
  /** How many non-null usage records were folded in. */
  runs: number;
  /** Models whose tokens are counted but whose cost is not (no price configured). */
  unpriced_models: string[];
}

/**
 * Folds every stored usage record into one total — e.g. every report a user
 * has generated. Counters are summed as recorded; cost is re-priced from the
 * merged per-model tokens so it always reflects the current price table.
 */
export function sumUsage(
  records: readonly (ReportUsage | null | undefined)[],
): UsageTotals {
  const byModel: Record<string, ModelUsage> = {};
  const totals = { calls: 0, input: 0, output: 0, searches: 0, runs: 0 };

  for (const record of records) {
    if (!record) continue;
    totals.runs += 1;
    totals.calls += record.calls;
    totals.input += record.input_tokens;
    totals.output += record.output_tokens;
    totals.searches += record.web_search_calls;
    for (const [model, usage] of Object.entries(record.by_model)) {
      foldModelUsage(byModel, model, usage);
    }
  }

  const { cost, unpricedModels } = estimatePartialCostUsd(
    byModel,
    totals.searches,
  );
  return {
    calls: totals.calls,
    input_tokens: totals.input,
    output_tokens: totals.output,
    web_search_calls: totals.searches,
    by_model: byModel,
    estimated_cost_usd: cost,
    runs: totals.runs,
    unpriced_models: unpricedModels,
  };
}

/** Usage consumed between two snapshots of the same collector (e.g. one expert's run). */
export function diffUsage(before: ReportUsage, after: ReportUsage): ReportUsage {
  const byModel: Record<string, ModelUsage> = {};
  for (const [model, a] of Object.entries(after.by_model)) {
    const b = before.by_model[model];
    const delta = {
      calls: a.calls - (b?.calls ?? 0),
      input_tokens: a.input_tokens - (b?.input_tokens ?? 0),
      output_tokens: a.output_tokens - (b?.output_tokens ?? 0),
    };
    if (delta.calls > 0 || delta.input_tokens > 0 || delta.output_tokens > 0) {
      byModel[model] = delta;
    }
  }
  const webSearchCalls = after.web_search_calls - before.web_search_calls;
  return {
    calls: after.calls - before.calls,
    input_tokens: after.input_tokens - before.input_tokens,
    output_tokens: after.output_tokens - before.output_tokens,
    web_search_calls: webSearchCalls,
    by_model: byModel,
    estimated_cost_usd: estimateCostUsd(byModel, webSearchCalls),
  };
}

/** Sum of two usage records (e.g. a run plus its later "Share more" calls). */
export function addUsage(a: ReportUsage, b: ReportUsage): ReportUsage {
  const byModel: Record<string, ModelUsage> = structuredClone(a.by_model);
  for (const [model, usage] of Object.entries(b.by_model)) {
    foldModelUsage(byModel, model, usage);
  }
  const webSearchCalls = a.web_search_calls + b.web_search_calls;
  return {
    calls: a.calls + b.calls,
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    web_search_calls: webSearchCalls,
    by_model: byModel,
    estimated_cost_usd: estimateCostUsd(byModel, webSearchCalls),
  };
}

export interface UsageCollector {
  record(
    model: string,
    usage: { input_tokens?: number; output_tokens?: number } | null | undefined,
    webSearchCalls: number,
  ): void;
  snapshot(): ReportUsage;
}

export function createUsageCollector(): UsageCollector {
  const byModel: Record<string, ModelUsage> = {};
  let webSearchCalls = 0;

  return {
    record(model, usage, searchCalls) {
      foldModelUsage(byModel, model, {
        calls: 1,
        input_tokens: usage?.input_tokens ?? 0,
        output_tokens: usage?.output_tokens ?? 0,
      });
      webSearchCalls += searchCalls;
    },

    snapshot() {
      const models = Object.values(byModel);
      return {
        calls: models.reduce((n, m) => n + m.calls, 0),
        input_tokens: models.reduce((n, m) => n + m.input_tokens, 0),
        output_tokens: models.reduce((n, m) => n + m.output_tokens, 0),
        web_search_calls: webSearchCalls,
        by_model: structuredClone(byModel),
        estimated_cost_usd: estimateCostUsd(byModel, webSearchCalls),
      };
    },
  };
}
