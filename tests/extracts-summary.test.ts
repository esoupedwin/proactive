import { describe, expect, it } from "vitest";
import {
  summaryInstructions,
  summaryPayload,
  summaryWindowStart,
} from "@/lib/ai/extracts-summary";
import { createUsageCollector } from "@/lib/ai/usage";
import type { ExtractRecord, Topic } from "@/lib/types";

const topic = {
  title: "UMNO to leave UG?",
  description: "Track whether UMNO exits the Unity Government",
  watch_mode: "question",
  analytical_question: "Will UMNO leave the Unity Government (UG)?",
  interest_frame: [
    {
      name: "Political Incentives",
      key_question: "Does UMNO gain more by staying or leaving?",
      indicators: ["polling trends"],
    },
    {
      name: "Coalition Arithmetic",
      key_question: "Can the UG survive without UMNO?",
      indicators: [],
    },
  ],
} as unknown as Topic;

function makeExtract(overrides: Partial<ExtractRecord>): ExtractRecord {
  return {
    id: "e1",
    topic_id: "t1",
    user_id: "u1",
    source_type: "news",
    title: "Title",
    publisher: "FMT",
    url: "https://example.com/a",
    canonical_url: "example.com/a",
    published_at: "2026-09-04",
    factor: "Political Incentives",
    gist: "Something happened.",
    relevance: "",
    novelty: null,
    contradiction: "",
    corroborations: 0,
    embedding: null,
    first_seen_at: "2026-09-04T00:00:00Z",
    last_seen_at: "2026-09-04T00:00:00Z",
    created_at: "2026-09-04T00:00:00Z",
    ...overrides,
  } as ExtractRecord;
}

describe("summaryInstructions", () => {
  it("carries the analytical question and asks for a verdict-facing close", () => {
    const text = summaryInstructions(topic, null);
    expect(text).toContain(
      "Analytical question to answer: Will UMNO leave the Unity Government (UG)?",
    );
    expect(text).toContain("supports, weakens, or leaves unchanged");
    expect(text).toContain("SECURITY");
  });

  it("lists every key factor with its key question when unfiltered", () => {
    const text = summaryInstructions(topic, null);
    expect(text).toContain(
      "- Political Incentives · Does UMNO gain more by staying or leaving?",
    );
    expect(text).toContain("- Coalition Arithmetic · Can the UG survive without UMNO?");
    expect(text).toContain("group the developments under the key factors");
    expect(text).not.toContain("filtered to ONE key factor");
  });

  it("scopes to the filtered factor and surfaces its key question", () => {
    const text = summaryInstructions(topic, "Political Incentives");
    expect(text).toContain("filtered to ONE key factor: Political Incentives");
    expect(text).toContain(
      "That factor's key question: Does UMNO gain more by staying or leaving?",
    );
    // Filtered: no per-factor grouping, and the other factors stay out.
    expect(text).not.toContain("Coalition Arithmetic");
  });

  it("keeps a monitor topic verdict-free", () => {
    const monitor = { ...topic, watch_mode: "monitor", analytical_question: null } as Topic;
    const text = summaryInstructions(monitor, null);
    expect(text).not.toContain("Analytical question");
    expect(text).toContain("most consequential development");
  });
});

describe("summaryPayload", () => {
  it("orders oldest first and keeps only digest-relevant fields", () => {
    const json = summaryPayload([
      makeExtract({ title: "Newer", created_at: "2026-09-05T00:00:00Z" }),
      makeExtract({ title: "Older", created_at: "2026-09-03T00:00:00Z" }),
    ]);
    const parsed = JSON.parse(json) as { extracts: Array<Record<string, unknown>> };
    expect(parsed.extracts.map((e) => e.title)).toEqual(["Older", "Newer"]);
    // No urls or ids — the model has nothing to leak or hallucinate links from.
    expect(json).not.toContain("https://");
    expect(json).not.toContain('"id"');
  });

  it("carries relevance, contradiction, and corroboration only when present", () => {
    const json = summaryPayload([
      makeExtract({
        relevance: "Bears on the exit question",
        contradiction: "Conflicts with X",
        corroborations: 2,
      }),
      makeExtract({ title: "Plain", relevance: "" }),
    ]);
    const [flagged, plain] = (JSON.parse(json) as {
      extracts: Array<Record<string, unknown>>;
    }).extracts;
    expect(flagged).toMatchObject({
      relevance: "Bears on the exit question",
      contradiction: "Conflicts with X",
      corroborations: 2,
    });
    expect(plain).not.toHaveProperty("relevance");
    expect(plain).not.toHaveProperty("contradiction");
    expect(plain).not.toHaveProperty("corroborations");
  });
});

describe("summaryWindowStart", () => {
  it("starts the window the configured days back", () => {
    expect(summaryWindowStart(new Date("2026-09-05T12:00:00Z"), 3)).toBe(
      "2026-09-02T12:00:00.000Z",
    );
  });
});

describe("provider-reported cost passthrough", () => {
  it("prefers the provider's billed cost over the price-table estimate", () => {
    const usage = createUsageCollector();
    usage.record(
      "deepseek/deepseek-v4-flash",
      { input_tokens: 20_000, output_tokens: 800, cost_usd: 0.00184 },
      0,
      "extracts_summary",
    );
    const [entry] = usage.drainLedger();
    expect(entry!.estimated_cost_usd).toBe(0.00184);
    expect(entry!.activity).toBe("extracts_summary");
  });

  it("still estimates from the table when no provider cost is given", () => {
    const usage = createUsageCollector();
    usage.record("gpt-5-mini", { input_tokens: 1_000_000 }, 0);
    const [entry] = usage.drainLedger();
    expect(entry!.estimated_cost_usd).toBeCloseTo(0.25, 4);
  });
});
