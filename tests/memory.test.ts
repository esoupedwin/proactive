import { describe, expect, it } from "vitest";
import { mergeMemoryDelta } from "@/lib/ai/memory";
import type { MemoryUpdate } from "@/lib/ai/schemas";
import type { TopicMemory } from "@/lib/types";

const NOW = "2026-07-28T12:00:00Z";

const memory: TopicMemory = {
  topic_id: "t1",
  user_id: "u1",
  reported_developments: [
    { id: "d1", text: "Coalition held together", first_reported_at: "2026-07-20T00:00:00Z" },
  ],
  themes: [
    { theme: "Coalition stability", trend: "steady" },
    { theme: "Old narrative", trend: "fading" },
  ],
  facts: [
    {
      fact: "JS-SEZ is a joint economic zone",
      entities: ["JS-SEZ"],
      confidence: "high",
      source_note: "news, 20 Jul",
    },
    {
      fact: "Election expected in 2027",
      entities: [],
      confidence: "low",
      source_note: "speculation",
    },
  ],
  open_questions: [
    { question: "Will the RTS Link open on time?", context: "unclear" },
  ],
  updated_at: "2026-07-20T00:00:00Z",
};

const emptyUpdate: MemoryUpdate = {
  new_developments: [],
  new_facts: [],
  obsolete_facts: [],
  new_themes: [],
  obsolete_themes: [],
  new_questions: [],
  resolved_questions: [],
};

describe("mergeMemoryDelta", () => {
  it("preserves everything when the delta is empty", () => {
    const merged = mergeMemoryDelta(memory, emptyUpdate, NOW);
    expect(merged.reported_developments).toHaveLength(1);
    expect(merged.facts).toHaveLength(2);
    expect(merged.themes).toHaveLength(2);
    expect(merged.open_questions).toHaveLength(1);
    expect(merged.updated_at).toBe(NOW);
  });

  it("prepends new developments and keeps original first_reported_at", () => {
    const merged = mergeMemoryDelta(
      memory,
      { ...emptyUpdate, new_developments: [{ text: "Cabinet reshuffled" }] },
      NOW,
    );
    expect(merged.reported_developments[0]!.text).toBe("Cabinet reshuffled");
    expect(merged.reported_developments[0]!.first_reported_at).toBe(NOW);
    // The pre-existing development keeps its original timestamp.
    expect(merged.reported_developments[1]!.first_reported_at).toBe(
      "2026-07-20T00:00:00Z",
    );
  });

  it("ignores developments already reported, case-insensitively", () => {
    const merged = mergeMemoryDelta(
      memory,
      {
        ...emptyUpdate,
        new_developments: [{ text: "coalition held together" }],
      },
      NOW,
    );
    expect(merged.reported_developments).toHaveLength(1);
  });

  it("strips entity markers from developments", () => {
    const merged = mergeMemoryDelta(
      memory,
      { ...emptyUpdate, new_developments: [{ text: "**KWAP** invested again" }] },
      NOW,
    );
    expect(merged.reported_developments[0]!.text).toBe("KWAP invested again");
  });

  it("revises a fact via obsolete + new", () => {
    const merged = mergeMemoryDelta(
      memory,
      {
        ...emptyUpdate,
        obsolete_facts: ["Election expected in 2027"],
        new_facts: [
          {
            fact: "Election expected in 2028",
            entities: [],
            confidence: "medium",
            source_note: "news, 28 Jul",
          },
        ],
      },
      NOW,
    );
    const texts = merged.facts.map((f) => f.fact);
    expect(texts).toContain("Election expected in 2028");
    expect(texts).not.toContain("Election expected in 2027");
    expect(texts).toContain("JS-SEZ is a joint economic zone");
  });

  it("replaces a theme when its trend changes, and drops obsolete ones", () => {
    const merged = mergeMemoryDelta(
      memory,
      {
        ...emptyUpdate,
        new_themes: [{ theme: "Coalition stability", trend: "weakening" }],
        obsolete_themes: ["Old narrative"],
      },
      NOW,
    );
    expect(merged.themes).toHaveLength(1);
    expect(merged.themes[0]).toEqual({
      theme: "Coalition stability",
      trend: "weakening",
    });
  });

  it("drops resolved questions and adds new ones", () => {
    const merged = mergeMemoryDelta(
      memory,
      {
        ...emptyUpdate,
        resolved_questions: ["Will the RTS Link open on time?"],
        new_questions: [{ question: "Who funds phase two?", context: "unclear" }],
      },
      NOW,
    );
    expect(merged.open_questions).toHaveLength(1);
    expect(merged.open_questions[0]!.question).toBe("Who funds phase two?");
  });

  it("does not duplicate a fact that already exists", () => {
    const merged = mergeMemoryDelta(
      memory,
      {
        ...emptyUpdate,
        new_facts: [
          {
            fact: "JS-SEZ is a joint economic zone",
            entities: ["JS-SEZ"],
            confidence: "high",
            source_note: "news, 28 Jul",
          },
        ],
      },
      NOW,
    );
    expect(merged.facts).toHaveLength(2);
  });

  it("caps developments at 60, newest first", () => {
    const big: TopicMemory = {
      ...memory,
      reported_developments: Array.from({ length: 60 }, (_, i) => ({
        id: `d${i}`,
        text: `old ${i}`,
        first_reported_at: "2026-07-01T00:00:00Z",
      })),
    };
    const merged = mergeMemoryDelta(
      big,
      { ...emptyUpdate, new_developments: [{ text: "brand new" }] },
      NOW,
    );
    expect(merged.reported_developments).toHaveLength(60);
    expect(merged.reported_developments[0]!.text).toBe("brand new");
  });
});
