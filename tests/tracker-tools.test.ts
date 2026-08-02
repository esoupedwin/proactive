import { describe, expect, it, vi } from "vitest";
import { createInMemoryExtractStore } from "@/lib/agents/extract-store";
import type { ExaSearcher } from "@/lib/agents/exa";
import {
  corroborateExtract,
  exaSearch,
  recordExtract,
  searchExistingExtracts,
  type TrackerToolDeps,
} from "@/lib/agents/tracker/tools";
import type { Topic } from "@/lib/types";

const topic: Topic = {
  id: "topic-1",
  user_id: "user-1",
  title: "AI agents",
  description: "Track agentic AI frameworks",
  interest_areas: ["frameworks"],
  detail_level: "standard",
  frequency: "daily",
  status: "active",
  position: 0,
  news_query: null,
  last_generated_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function makeDeps(exa?: ExaSearcher): TrackerToolDeps {
  return {
    store: createInMemoryExtractStore(),
    exa: exa ?? { search: vi.fn(async () => []) },
    topic,
  };
}

const extractInput = {
  source_type: "news" as const,
  title: "SDK released",
  publisher: "TechNews",
  url: "https://example.com/sdk",
  published_at: "2026-08-01",
  gist: "A new SDK shipped.",
  relevance: "relevant",
  novelty: "new" as const,
  contradiction: "",
};

describe("tracker tools", () => {
  it("exa_search passes filters through and formats results with highlights", async () => {
    const search = vi.fn(async () => [
      {
        title: "Deep dive",
        url: "https://blog.example/post",
        publishedDate: "2026-07-30",
        author: "Jo",
        text: "full text",
        highlights: ["key passage one", "key passage two"],
      },
    ]);
    const deps = makeDeps({ search });

    const out = await exaSearch(deps, {
      query: "agent framework criticism",
      days_back: 7,
      category: "personal site",
    });

    expect(search).toHaveBeenCalledWith("agent framework criticism", {
      daysBack: 7,
      category: "personal site",
    });
    const parsed = JSON.parse(out);
    expect(parsed[0].excerpt).toBe("key passage one … key passage two");
    expect(parsed[0].published).toBe("2026-07-30");
  });

  it("exa_search reports empty results plainly", async () => {
    const deps = makeDeps();
    const out = await exaSearch(deps, {
      query: "x",
      days_back: null,
      category: null,
    });
    expect(out).toBe("No results.");
  });

  it("record_extract returns created then merged outcomes", async () => {
    const deps = makeDeps();
    const first = await recordExtract(deps, extractInput);
    expect(first.outcome).toBe("created");
    const second = await recordExtract(deps, {
      ...extractInput,
      url: "https://www.example.com/sdk",
    });
    expect(second.outcome).toBe("merged");
    expect(second.id).toBe(first.id);
  });

  it("search_existing_extracts surfaces recorded extracts with ids", async () => {
    const deps = makeDeps();
    const { id } = await recordExtract(deps, extractInput);
    const out = await searchExistingExtracts(deps, { query: "SDK" });
    const parsed = JSON.parse(out);
    expect(parsed[0].id).toBe(id);
    expect(parsed[0].gist).toBe("A new SDK shipped.");
  });

  it("corroborate_extract increments the count", async () => {
    const deps = makeDeps();
    const { id } = await recordExtract(deps, extractInput);
    await corroborateExtract(deps, {
      extract_id: id,
      url: "https://other.com/coverage",
    });
    const [row] = await deps.store.recentExtracts(topic.id);
    expect(row!.corroborations).toBe(1);
    expect(row!.corroborating_urls).toEqual(["https://other.com/coverage"]);
  });
});
