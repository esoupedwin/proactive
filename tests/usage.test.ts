import { describe, expect, it } from "vitest";
import {
  addUsage,
  createUsageCollector,
  diffUsage,
  estimateCallCostUsd,
  estimateCostUsd,
  estimatePartialCostUsd,
  pricingFor,
  sumUsage,
} from "@/lib/ai/usage";
import {
  formatTokens,
  formatUsageSummary,
  formatUsd,
  formatUsdDetailed,
} from "@/lib/reports";

describe("usage collector", () => {
  it("aggregates calls, tokens, and web-search calls per model", () => {
    const collector = createUsageCollector();
    collector.record("gpt-5-mini", { input_tokens: 1000, output_tokens: 200 }, 2);
    collector.record("gpt-5-mini", { input_tokens: 500, output_tokens: 100 }, 1);
    collector.record("gpt-5", { input_tokens: 4000, output_tokens: 800 }, 0);

    const snap = collector.snapshot();
    expect(snap.calls).toBe(3);
    expect(snap.input_tokens).toBe(5500);
    expect(snap.output_tokens).toBe(1100);
    expect(snap.web_search_calls).toBe(3);
    expect(snap.by_model["gpt-5-mini"]).toEqual({
      calls: 2,
      input_tokens: 1500,
      output_tokens: 300,
    });
  });

  it("tolerates missing usage payloads", () => {
    const collector = createUsageCollector();
    collector.record("gpt-5", undefined, 0);
    const snap = collector.snapshot();
    expect(snap.calls).toBe(1);
    expect(snap.input_tokens).toBe(0);
  });
});

describe("pricing", () => {
  it("longest-prefix matches dated model ids", () => {
    // Must resolve to gpt-5-mini pricing, not gpt-5.
    expect(pricingFor("gpt-5-mini-2026-01-01")).toEqual(
      pricingFor("gpt-5-mini"),
    );
    expect(pricingFor("gpt-5-mini")).not.toEqual(pricingFor("gpt-5"));
  });

  it("returns null for unknown models", () => {
    expect(pricingFor("some-future-model")).toBeNull();
  });
});

describe("estimateCostUsd", () => {
  it("computes token + web-search cost", () => {
    const cost = estimateCostUsd(
      {
        // 1M input @ $1.25 + 100k output @ $10/M = 1.25 + 1.0
        "gpt-5": { calls: 1, input_tokens: 1_000_000, output_tokens: 100_000 },
      },
      10, // 10 web searches @ $0.01
    );
    expect(cost).toBeCloseTo(2.35, 4);
  });

  it("is null when any model has unknown pricing", () => {
    expect(
      estimateCostUsd(
        {
          "gpt-5": { calls: 1, input_tokens: 1000, output_tokens: 100 },
          "mystery-model": { calls: 1, input_tokens: 10, output_tokens: 1 },
        },
        0,
      ),
    ).toBeNull();
  });
});

describe("diffUsage / addUsage", () => {
  it("attributes only the delta between two snapshots, with its own cost", () => {
    const collector = createUsageCollector();
    collector.record("gpt-5", { input_tokens: 10_000, output_tokens: 2_000 }, 1);
    const before = collector.snapshot();
    collector.record("gpt-5-mini", { input_tokens: 3_000, output_tokens: 500 }, 1);
    collector.record("gpt-5", { input_tokens: 1_000, output_tokens: 100 }, 0);

    const delta = diffUsage(before, collector.snapshot());
    expect(delta.calls).toBe(2);
    expect(delta.input_tokens).toBe(4_000);
    expect(delta.output_tokens).toBe(600);
    expect(delta.web_search_calls).toBe(1);
    expect(delta.by_model["gpt-5-mini"]).toEqual({
      calls: 1,
      input_tokens: 3_000,
      output_tokens: 500,
    });
    // Models untouched in the delta are omitted... gpt-5 had activity, so present.
    expect(delta.by_model["gpt-5"]).toEqual({
      calls: 1,
      input_tokens: 1_000,
      output_tokens: 100,
    });
    expect(delta.estimated_cost_usd).toBeCloseTo(
      (3_000 / 1e6) * 0.25 + (500 / 1e6) * 2 + (1_000 / 1e6) * 1.25 + (100 / 1e6) * 10 + 0.01,
      6,
    );
  });

  it("adds two usage records and reprices the total", () => {
    const a = {
      calls: 1,
      input_tokens: 1_000,
      output_tokens: 200,
      web_search_calls: 1,
      by_model: { "gpt-5-mini": { calls: 1, input_tokens: 1_000, output_tokens: 200 } },
      estimated_cost_usd: 0.011,
    };
    const b = {
      calls: 1,
      input_tokens: 500,
      output_tokens: 100,
      web_search_calls: 0,
      by_model: { "gpt-5-mini": { calls: 1, input_tokens: 500, output_tokens: 100 } },
      estimated_cost_usd: 0.001,
    };
    const sum = addUsage(a, b);
    expect(sum.calls).toBe(2);
    expect(sum.input_tokens).toBe(1_500);
    expect(sum.by_model["gpt-5-mini"]!.input_tokens).toBe(1_500);
    expect(sum.web_search_calls).toBe(1);
    // estimateCostUsd rounds totals to 4 decimal places.
    expect(sum.estimated_cost_usd).toBeCloseTo(
      (1_500 / 1e6) * 0.25 + (300 / 1e6) * 2 + 0.01,
      3,
    );
  });
});

describe("estimatePartialCostUsd", () => {
  it("prices what it can and names what it could not", () => {
    const { cost, unpricedModels } = estimatePartialCostUsd(
      {
        "gpt-5": { calls: 1, input_tokens: 1_000_000, output_tokens: 100_000 },
        "mystery-model": { calls: 1, input_tokens: 10_000, output_tokens: 1_000 },
      },
      10,
    );
    // Unlike estimateCostUsd, the known portion survives.
    expect(cost).toBeCloseTo(2.35, 4);
    expect(unpricedModels).toEqual(["mystery-model"]);
  });
});

describe("sumUsage", () => {
  const record = (
    model: string,
    input: number,
    output: number,
    searches = 0,
  ) => ({
    calls: 1,
    input_tokens: input,
    output_tokens: output,
    web_search_calls: searches,
    by_model: { [model]: { calls: 1, input_tokens: input, output_tokens: output } },
    estimated_cost_usd: 0,
  });

  it("totals every record and reprices from the merged per-model tokens", () => {
    const total = sumUsage([
      record("gpt-5-mini", 1_000_000, 100_000, 2),
      record("gpt-5-mini", 1_000_000, 100_000),
      record("gpt-5", 1_000_000, 100_000, 1),
    ]);

    expect(total.runs).toBe(3);
    expect(total.calls).toBe(3);
    expect(total.input_tokens).toBe(3_000_000);
    expect(total.output_tokens).toBe(300_000);
    expect(total.web_search_calls).toBe(3);
    expect(total.by_model["gpt-5-mini"]).toEqual({
      calls: 2,
      input_tokens: 2_000_000,
      output_tokens: 200_000,
    });
    // 2M in @ $0.25 + 200k out @ $2 + 1M in @ $1.25 + 100k out @ $10 + 3 searches
    expect(total.estimated_cost_usd).toBeCloseTo(
      0.5 + 0.4 + 1.25 + 1.0 + 0.03,
      4,
    );
    expect(total.unpriced_models).toEqual([]);
  });

  it("skips nulls and returns a zeroed total when there is nothing to count", () => {
    const total = sumUsage([null, undefined]);
    expect(total.runs).toBe(0);
    expect(total.calls).toBe(0);
    expect(total.estimated_cost_usd).toBe(0);
    expect(total.by_model).toEqual({});
  });

  it("keeps the priced portion when one model has no price", () => {
    const total = sumUsage([
      record("gpt-5", 1_000_000, 0),
      record("mystery-model", 500_000, 1_000),
    ]);
    expect(total.input_tokens).toBe(1_500_000);
    expect(total.estimated_cost_usd).toBeCloseTo(1.25, 4);
    expect(total.unpriced_models).toEqual(["mystery-model"]);
  });
});

describe("estimateCallCostUsd", () => {
  it("prices one call from its own model and tokens", () => {
    // 10k input @ $1.25/M + 1k output @ $10/M + 2 searches @ $0.01
    expect(estimateCallCostUsd("gpt-5", 10_000, 1_000, 2)).toBeCloseTo(
      0.0125 + 0.01 + 0.02,
      6,
    );
  });

  it("keeps sub-cent precision instead of rounding to zero", () => {
    const cost = estimateCallCostUsd("gpt-5-nano", 500, 100)!;
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.001);
  });

  it("is null for unknown models", () => {
    expect(estimateCallCostUsd("mystery-model", 1000, 100)).toBeNull();
  });

  it("resolves dated model ids to the base model's pricing", () => {
    expect(estimateCallCostUsd("gpt-5-mini-2026-03-17", 1_000_000, 0)).toBe(
      estimateCallCostUsd("gpt-5-mini", 1_000_000, 0),
    );
  });
});

describe("formatUsdDetailed", () => {
  it("scales decimals to the magnitude", () => {
    expect(formatUsdDetailed(0.03)).toBe("$0.03");
    expect(formatUsdDetailed(0.0021)).toBe("$0.002");
    expect(formatUsdDetailed(0.00042)).toBe("$0.0004");
    expect(formatUsdDetailed(0)).toBe("$0");
  });

  it("renders unknown pricing as a dash", () => {
    expect(formatUsdDetailed(null)).toBe("—");
  });
});

describe("usage formatting", () => {
  it("formats token counts compactly", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(48_200)).toBe("48.2k");
    expect(formatTokens(1_300_000)).toBe("1.3M");
  });

  it("formats cost with a floor label for tiny amounts", () => {
    expect(formatUsd(0.19)).toBe("~$0.19");
    expect(formatUsd(0.004)).toBe("<$0.01");
  });

  it("summarizes usage and omits cost when unknown", () => {
    expect(
      formatUsageSummary({
        calls: 8,
        input_tokens: 40_000,
        output_tokens: 8_200,
        web_search_calls: 3,
        by_model: {},
        estimated_cost_usd: 0.19,
      }),
    ).toBe("48.2k tokens · ~$0.19");

    expect(
      formatUsageSummary({
        calls: 8,
        input_tokens: 40_000,
        output_tokens: 8_200,
        web_search_calls: 3,
        by_model: {},
        estimated_cost_usd: null,
      }),
    ).toBe("48.2k tokens");

    expect(formatUsageSummary(null)).toBeNull();
  });
});
