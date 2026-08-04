import { describe, expect, it } from "vitest";
import { runSentiment } from "@/lib/ai/experts/sentiment";
import type { Llm, StructuredCallOptions } from "@/lib/ai/llm";
import type { ReportSections, Topic } from "@/lib/types";

const topic: Topic = {
  id: "t1",
  user_id: "u1",
  title: "Malaysia Politics",
  description: "Follow Malaysian political developments",
  interest_frame: [],
  watch_mode: "monitor",
  analytical_question: null,
  detail_level: "standard",
  frequency: "daily",
  status: "active",
  position: 0,
  news_query: null,
  last_generated_at: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

const sections: ReportSections = {
  latest_developments: [
    { text: "Audit committee reshuffled.", source_refs: [0] },
  ],
  community_reaction: [],
  practitioner_view: [],
  cross_source_takeaway: "Accountability contest continues.",
  what_changed: [],
  no_meaningful_change: false,
};

/** Captures the call and returns fixed points. */
function fakeLlm(): { llm: Llm; captured: () => StructuredCallOptions<unknown> } {
  let seen: StructuredCallOptions<unknown> | null = null;
  return {
    llm: {
      async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
        seen = options as StructuredCallOptions<unknown>;
        return options.schema.parse({
          points: [
            "  r/malaysia is broadly skeptical of the reshuffle.  ",
            "A minority sees it as routine housekeeping.",
            "   ",
          ],
        });
      },
    },
    captured: () => seen!,
  };
}

describe("runSentiment", () => {
  it("returns trimmed point-form findings, dropping empty points", async () => {
    const { llm } = fakeLlm();
    const result = await runSentiment(llm, topic, sections);
    expect(result.sentiment).toEqual({
      points: [
        "r/malaysia is broadly skeptical of the reshuffle.",
        "A minority sees it as routine housekeeping.",
      ],
    });
  });

  it("runs on the search tier with web search enabled — Reddit is live data", async () => {
    const { llm, captured } = fakeLlm();
    await runSentiment(llm, topic, sections);
    expect(captured().tier).toBe("search");
    expect(captured().useWebSearch).toBe(true);
  });

  it("sends the topic and report, and instructs Reddit-focused searching", async () => {
    const { llm, captured } = fakeLlm();
    await runSentiment(llm, topic, sections);

    const input = JSON.parse(captured().input) as Record<string, unknown>;
    expect(Object.keys(input).sort()).toEqual(["report", "topic"]);
    expect(input.report).toContain("Audit committee reshuffled.");

    const instructions = captured().instructions;
    expect(instructions).toContain("site:reddit.com");
    expect(instructions).toContain("at most 3 searches");
  });

  it("rejects a response missing the points field", async () => {
    const llm: Llm = {
      async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
        return options.schema.parse({ commentary: "old prose shape" });
      },
    };
    await expect(runSentiment(llm, topic, sections)).rejects.toThrow();
  });
});
