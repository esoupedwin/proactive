import { describe, expect, it } from "vitest";
import type { Llm } from "@/lib/ai/llm";
import { planFollowupQueries } from "@/lib/ai/planner";
import type { FoundSource } from "@/lib/ai/schemas";
import type { Topic } from "@/lib/types";

const topic: Topic = {
  id: "t1",
  user_id: "u1",
  title: "Latest top LLMs",
  description: "Frontier landscape",
  interest_areas: ["coding"],
  detail_level: "standard",
  frequency: "daily",
  status: "active",
  position: 0,
  news_query: null,
  last_generated_at: null,
  created_at: "2026-07-20T00:00:00Z",
  updated_at: "2026-07-20T00:00:00Z",
};

const newsFindings: FoundSource[] = [
  {
    title: "Vendor ships Model X",
    url: "https://news.example.com/model-x",
    publisher: "Example News",
    published_at: "2026-07-24",
    snippet: "Model X released with coding focus.",
  },
];

function llmReturning(queries: string[]): Llm {
  return {
    async structured<T>(): Promise<T> {
      return { queries } as T;
    },
  };
}

const throwingLlm: Llm = {
  async structured(): Promise<never> {
    throw new Error("should not be called / model down");
  },
};

describe("planFollowupQueries", () => {
  it("returns the fallback without an LLM call when news found nothing", async () => {
    const result = await planFollowupQueries(
      throwingLlm,
      topic,
      "reddit",
      [],
      ["generic reddit query"],
    );
    expect(result).toEqual(["generic reddit query"]);
  });

  it("caps at one targeted query plus one broad fallback (one search per channel)", async () => {
    const result = await planFollowupQueries(
      llmReturning(["Model X reaction", "Model X vs Claude"]),
      topic,
      "reddit",
      newsFindings,
      ["generic reddit query", "second fallback ignored"],
    );
    expect(result).toEqual(["Model X reaction", "generic reddit query"]);
  });

  it("dedupes when the targeted query repeats the fallback", async () => {
    const result = await planFollowupQueries(
      llmReturning(["generic reddit query"]),
      topic,
      "reddit",
      newsFindings,
      ["generic reddit query"],
    );
    expect(result).toEqual(["generic reddit query"]);
  });

  it("falls back to planned queries when the LLM call fails", async () => {
    const result = await planFollowupQueries(
      throwingLlm,
      topic,
      "medium",
      newsFindings,
      ["generic medium query"],
    );
    expect(result).toEqual(["generic medium query"]);
  });

  it("falls back when the LLM returns only empty queries", async () => {
    const result = await planFollowupQueries(
      llmReturning(["", "  "]),
      topic,
      "medium",
      newsFindings,
      [],
    );
    expect(result).toEqual([]);
  });
});
