import { describe, expect, it } from "vitest";
import {
  createUsageCollector,
  estimateCallCostUsd,
  estimateCostUsd,
} from "@/lib/ai/usage";

describe("cached input pricing", () => {
  it("bills cached input tokens at the cached rate", () => {
    // gpt-5: $1.25/M input, $0.125/M cached, $10/M output.
    // 1M input of which 800k cached: 200k*1.25 + 800k*0.125 = 0.25 + 0.10.
    expect(estimateCallCostUsd("gpt-5", 1_000_000, 0, 0, 800_000)).toBeCloseTo(
      0.35,
      6,
    );
    // Same call without caching costs the full input rate.
    expect(estimateCallCostUsd("gpt-5", 1_000_000, 0, 0, 0)).toBeCloseTo(
      1.25,
      6,
    );
  });

  it("clamps a cached count that exceeds total input", () => {
    // Bad upstream data must not price negative uncached tokens.
    expect(estimateCallCostUsd("gpt-5", 100, 0, 0, 500)).toBe(
      estimateCallCostUsd("gpt-5", 100, 0, 0, 100),
    );
  });

  it("prices cached tokens at the full rate for models with no cached price", () => {
    // Embeddings define no cached_input — same figure either way, which is
    // also how records stored before caching was tracked keep their totals.
    expect(
      estimateCallCostUsd("text-embedding-3-small", 1_000_000, 0, 0, 500_000),
    ).toBe(estimateCallCostUsd("text-embedding-3-small", 1_000_000, 0, 0, 0));
  });

  it("flows cached tokens through the collector into snapshot cost", () => {
    const usage = createUsageCollector();
    usage.record(
      "gpt-5",
      { input_tokens: 1_000_000, output_tokens: 0, cached_input_tokens: 800_000 },
      0,
      "reporter_turn",
    );
    const snap = usage.snapshot();
    expect(snap.cached_input_tokens).toBe(800_000);
    expect(snap.by_model["gpt-5"]!.cached_input_tokens).toBe(800_000);
    expect(snap.estimated_cost_usd).toBeCloseTo(0.35, 4);
    // estimateCostUsd over the stored by_model agrees.
    expect(estimateCostUsd(snap.by_model, 0)).toBeCloseTo(0.35, 4);
  });
});

describe("collector ledger", () => {
  it("buffers one entry per recorded call, priced individually", () => {
    const usage = createUsageCollector();
    usage.record(
      "gpt-5-mini",
      { input_tokens: 1000, output_tokens: 200 },
      2,
      "sentiment_reading",
    );
    usage.record("text-embedding-3-small", { input_tokens: 500 }, 0, "embedding");

    const entries = usage.drainLedger();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      activity: "sentiment_reading",
      model: "gpt-5-mini",
      input_tokens: 1000,
      cached_input_tokens: 0,
      output_tokens: 200,
      web_search_calls: 2,
    });
    expect(entries[0]!.estimated_cost_usd).toBe(
      estimateCallCostUsd("gpt-5-mini", 1000, 200, 2),
    );
    expect(entries[1]!.activity).toBe("embedding");
    expect(Date.parse(entries[1]!.created_at)).not.toBeNaN();
  });

  it("drains destructively, so a second flush writes nothing twice", () => {
    const usage = createUsageCollector();
    usage.record("gpt-5", { input_tokens: 10, output_tokens: 5 }, 0);
    expect(usage.drainLedger()).toHaveLength(1);
    expect(usage.drainLedger()).toHaveLength(0);

    // Recording after a drain buffers fresh entries only.
    usage.record("gpt-5", { input_tokens: 20, output_tokens: 5 }, 0, "later");
    const second = usage.drainLedger();
    expect(second).toHaveLength(1);
    expect(second[0]!.activity).toBe("later");
    // The aggregate snapshot is unaffected by draining.
    expect(usage.snapshot().calls).toBe(2);
  });

  it("labels unnamed calls as llm_call", () => {
    const usage = createUsageCollector();
    usage.record("gpt-5", { input_tokens: 1, output_tokens: 1 }, 0);
    expect(usage.drainLedger()[0]!.activity).toBe("llm_call");
  });
});
