import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createInMemoryExtractStore,
  createSupabaseExtractStore,
  extractEmbeddingText,
  type CreateExtractInput,
} from "@/lib/agents/extract-store";
import type { Embedder } from "@/lib/agents/embeddings";
import type { Topic } from "@/lib/types";

const topic: Topic = {
  id: "topic-1",
  user_id: "user-1",
  title: "AI agents",
  description: "Track agentic AI frameworks",
  interest_frame: [{ name: "frameworks", key_question: "", indicators: [] }],
  watch_mode: "monitor",
  analytical_question: null,
  detail_level: "standard",
  frequency: "daily",
  status: "active",
  position: 0,
  news_query: null,
  last_generated_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function input(overrides: Partial<CreateExtractInput> = {}): CreateExtractInput {
  return {
    source_type: "news",
    title: "OpenAI ships agents SDK",
    publisher: "TechNews",
    url: "https://example.com/agents-sdk?utm_source=x",
    published_at: "2026-08-01",
    factor: null,
    gist: "OpenAI released a TypeScript agents SDK.",
    relevance: "Directly about agent frameworks",
    novelty: "new",
    contradiction: "",
    ...overrides,
  };
}

describe("in-memory extract store", () => {
  it("creates an extract with a normalized canonical url", async () => {
    const store = createInMemoryExtractStore();
    const { outcome, extract } = await store.createExtract(topic, input());
    expect(outcome).toBe("created");
    expect(extract.canonical_url).toBe("example.com/agents-sdk");
  });

  it("merges same-story urls (tracking params stripped) as corroboration", async () => {
    const store = createInMemoryExtractStore();
    await store.createExtract(topic, input());
    const { outcome, extract } = await store.createExtract(
      topic,
      input({ url: "https://www.example.com/agents-sdk" }),
    );
    expect(outcome).toBe("merged");
    expect(extract.corroborations).toBe(1);
    expect(store.extracts).toHaveLength(1);
  });

  it("tracks corroborating urls without duplicating the primary url", async () => {
    const store = createInMemoryExtractStore();
    const { extract } = await store.createExtract(topic, input());
    await store.corroborateExtract(extract.id, "https://other.com/report");
    await store.corroborateExtract(extract.id, extract.url);
    expect(extract.corroborations).toBe(2);
    expect(extract.corroborating_urls).toEqual(["https://other.com/report"]);
  });

  it("recentExtracts respects the afterCreatedAt cursor and ascending order", async () => {
    const store = createInMemoryExtractStore();
    const a = await store.createExtract(topic, input({ url: "https://a.com/1" }));
    const b = await store.createExtract(topic, input({ url: "https://b.com/2" }));
    const all = await store.recentExtracts(topic.id);
    expect(all.map((e) => e.id)).toEqual([a.extract.id, b.extract.id]);
    const after = await store.recentExtracts(topic.id, {
      afterCreatedAt: a.extract.created_at,
    });
    expect(after.map((e) => e.id)).toEqual([b.extract.id]);
  });

  it("keyword-matches extracts in hybridSearch", async () => {
    const store = createInMemoryExtractStore();
    await store.createExtract(topic, input({ title: "Vector databases compared" }));
    await store.createExtract(
      topic,
      input({ url: "https://c.com/3", title: "Unrelated story", gist: "nothing" }),
    );
    const hits = await store.hybridSearch(topic.id, "vector databases");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.title).toBe("Vector databases compared");
  });

  it("stores and retrieves per-agent state independently", async () => {
    const store = createInMemoryExtractStore();
    await store.saveAgentState(topic, "tracker", { recent_subtopics: ["a"] });
    await store.saveAgentState(topic, "reporter", { cursor: "2026-08-01" });
    expect(await store.getAgentState(topic.id, "tracker")).toEqual({
      recent_subtopics: ["a"],
    });
    expect((await store.getAgentState(topic.id, "reporter")).cursor).toBe(
      "2026-08-01",
    );
  });
});

describe("supabase extract store contract", () => {
  const fixedVector = Array.from({ length: 4 }, (_, i) => i * 0.1);
  const embedder: Embedder = {
    embed: vi.fn(async (texts: string[]) => texts.map(() => fixedVector)),
  };

  it("hybridSearch embeds the query and calls the RPC with it", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const supabase = { rpc } as unknown as SupabaseClient;
    const store = createSupabaseExtractStore(supabase, embedder);

    await store.hybridSearch("topic-1", "agent frameworks", 5);

    expect(rpc).toHaveBeenCalledWith("search_extracts_hybrid", {
      p_topic_id: "topic-1",
      p_query: "agent frameworks",
      p_embedding: fixedVector,
      p_count: 5,
    });
  });

  it("createExtract merges on unique violation (23505)", async () => {
    const existing = {
      id: "x-1",
      topic_id: topic.id,
      url: "https://example.com/agents-sdk?utm_source=x",
      corroborations: 0,
      corroborating_urls: [],
    };
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
    const from = vi.fn((table: string) => {
      expect(table).toBe("extracts");
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { code: "23505", message: "duplicate" },
            }),
          }),
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({ single: async () => ({ data: existing, error: null }) }),
          }),
        }),
        update,
      };
    });
    const supabase = { from } as unknown as SupabaseClient;
    const store = createSupabaseExtractStore(supabase, embedder);

    const { outcome, extract } = await store.createExtract(
      topic,
      input({ url: "https://www.example.com/agents-sdk" }),
    );
    expect(outcome).toBe("merged");
    expect(extract.corroborations).toBe(1);
    expect(extract.corroborating_urls).toEqual([
      "https://www.example.com/agents-sdk",
    ]);
    expect(update).toHaveBeenCalled();
  });

  it("keeps embedding text stable between create and search", () => {
    expect(extractEmbeddingText("Title", "Gist")).toBe("Title — Gist");
  });
});
