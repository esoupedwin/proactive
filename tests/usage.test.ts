import { describe, expect, it } from "vitest";
import {
  createUsageCollector,
  estimateCallCostUsd,
  estimateCostUsd,
  pricingFor,
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
