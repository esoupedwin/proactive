import { describe, expect, it } from "vitest";
import {
  createUsageCollector,
  estimateCostUsd,
  pricingFor,
} from "@/lib/ai/usage";
import { formatTokens, formatUsageSummary, formatUsd } from "@/lib/reports";

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
