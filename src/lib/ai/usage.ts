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

/** Null if any used model has no known pricing (tokens still recorded). */
export function estimateCostUsd(
  byModel: Record<string, ModelUsage>,
  webSearchCalls: number,
): number | null {
  let cost = webSearchCalls * WEB_SEARCH_COST_PER_CALL;
  for (const [model, usage] of Object.entries(byModel)) {
    const price = pricingFor(model);
    if (!price) return null;
    cost +=
      (usage.input_tokens / 1_000_000) * price.input +
      (usage.output_tokens / 1_000_000) * price.output;
  }
  return Math.round(cost * 10_000) / 10_000;
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
      const entry = (byModel[model] ??= {
        calls: 0,
        input_tokens: 0,
        output_tokens: 0,
      });
      entry.calls += 1;
      entry.input_tokens += usage?.input_tokens ?? 0;
      entry.output_tokens += usage?.output_tokens ?? 0;
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
