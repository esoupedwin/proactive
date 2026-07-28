import { describe, expect, it } from "vitest";
import type { Llm, StructuredCallOptions } from "@/lib/ai/llm";
import { runReportPipeline, type ReportStore } from "@/lib/ai/pipeline";
import { createTraceCollector } from "@/lib/ai/trace";
import { createUsageCollector } from "@/lib/ai/usage";
import type {
  Extract,
  Report,
  ReportSections,
  Topic,
  TopicMemory,
} from "@/lib/types";

/**
 * Integration test for the full report pipeline using a mocked LLM and an
 * in-memory store — no OpenAI or Supabase required.
 */

const topic: Topic = {
  id: "topic-1",
  user_id: "user-1",
  title: "Latest top LLMs",
  description: "Where is the frontier heading?",
  interest_areas: ["coding", "reasoning"],
  detail_level: "standard",
  frequency: "daily",
  status: "active",
  position: 0,
  last_generated_at: null,
  created_at: "2026-07-20T00:00:00Z",
  updated_at: "2026-07-20T00:00:00Z",
};

/** Canned structured outputs keyed by schema name. */
function makeFakeLlm(overrides: Partial<Record<string, unknown>> = {}): Llm {
  const responses: Record<string, unknown> = {
    search_plan: {
      news_queries: ["new LLM releases"],
      reddit_queries: ["LLM release discussion"],
      medium_queries: ["LLM comparison practitioner"],
    },
    followup_queries: {
      queries: ["reaction to vendor new model"],
    },
    seek_result: {
      sources: [
        {
          title: "Vendor ships new model",
          url: "https://news.example.com/model?utm_source=x",
          publisher: "Example News",
          published_at: "2026-07-24",
          snippet: "A new model shipped.",
        },
        {
          // Duplicate of the first, differing only by tracking params.
          title: "Vendor ships new model",
          url: "https://news.example.com/model",
          publisher: "Example News",
          published_at: "2026-07-24",
          snippet: "A new model shipped (dup).",
        },
      ],
    },
    extraction_result: {
      extracts: [
        {
          source_type: "news",
          title: "Vendor ships new model",
          publisher: "Example News",
          url: "https://news.example.com/model?utm_source=x",
          published_at: "2026-07-24",
          gist: "A new model shipped.",
          relevance: "Frontier release",
          novelty: "new",
          contradiction: "",
        },
        {
          source_type: "news",
          title: "Vendor ships new model",
          publisher: "Example News",
          url: "https://news.example.com/model",
          published_at: "2026-07-24",
          gist: "A new model shipped with more detail.",
          relevance: "Frontier release",
          novelty: "new",
          contradiction: "",
        },
      ],
    },
    report_draft: {
      latest_developments: [
        { text: "A new model shipped.", source_refs: [0] },
        { text: "Invented claim.", source_refs: [99] },
      ],
      community_reaction: [],
      practitioner_view: [],
      cross_source_takeaway: "The frontier keeps moving.",
      what_changed: [{ text: "Initial baseline.", source_refs: [] }],
      no_meaningful_change: false,
      summary: "First briefing on frontier models.",
    },
    memory_update: {
      new_developments: [{ text: "A new model shipped." }],
      new_facts: [
        {
          fact: "Vendor shipped a new model",
          entities: ["Vendor"],
          confidence: "high",
          source_note: "Example News, 24 Jul",
        },
      ],
      obsolete_facts: [],
      new_themes: [{ theme: "Release cadence", trend: "accelerating" }],
      obsolete_themes: [],
      new_questions: [],
      resolved_questions: [],
    },
    ...overrides,
  };

  return {
    async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
      const canned = responses[options.schemaName];
      if (canned instanceof Error) throw canned;
      if (canned === undefined) {
        throw new Error(`no canned response for ${options.schemaName}`);
      }
      return options.schema.parse(canned);
    },
  };
}

interface StoreState {
  completed: { sections: ReportSections; summary: string } | null;
  failed: string | null;
  sources: Extract[];
  memory: TopicMemory | null;
  topicGenerated: boolean;
}

function makeMemoryStore(previous?: Report): {
  store: ReportStore;
  state: StoreState;
} {
  const state: StoreState = {
    completed: null,
    failed: null,
    sources: [],
    memory: null,
    topicGenerated: false,
  };

  const store: ReportStore = {
    async getTopicMemory() {
      return null;
    },
    async getLatestReadyReport() {
      return previous ?? null;
    },
    async saveSources(_reportId, _topic, extracts) {
      state.sources = extracts;
    },
    async completeReport(_reportId, sections, summary) {
      state.completed = { sections, summary };
    },
    async failReport(_reportId, message) {
      state.failed = message;
    },
    async saveTopicMemory(memory) {
      state.memory = memory;
    },
    async markTopicGenerated() {
      state.topicGenerated = true;
    },
  };

  return { store, state };
}

describe("runReportPipeline (mocked AI)", () => {
  it("produces a ready report with deduped, cited sources and updated memory", async () => {
    const { store, state } = makeMemoryStore();

    const result = await runReportPipeline({
      llm: makeFakeLlm(),
      store,
      topic,
      reportId: "report-1",
      imageFetcher: async () => ({
        url: "https://news.example.com/cover.jpg",
        alt: "Executives unveil the new model on stage",
      }),
    });

    expect(result.ok).toBe(true);

    // Cover image selected from the report's own (deduped) sources.
    expect(state.completed!.sections.hero_image).toEqual({
      url: "https://news.example.com/cover.jpg",
      source_ref: 0,
      alt: "Executives unveil the new model on stage",
      description: "Executives unveil the new model on stage",
    });

    // The two URL-duplicate extracts were merged into one persisted source.
    expect(state.sources).toHaveLength(1);

    // Report completed with sanitized citations: the invented ref-99 bullet dropped.
    expect(state.completed).not.toBeNull();
    expect(state.completed!.sections.latest_developments).toHaveLength(1);
    expect(state.completed!.sections.cross_source_takeaway).toBe(
      "The frontier keeps moving.",
    );
    expect(state.completed!.summary).toBe("First briefing on frontier models.");
    expect(state.failed).toBeNull();
    expect(state.topicGenerated).toBe(true);

    // Memory updated with the newly reported development.
    expect(state.memory).not.toBeNull();
    expect(state.memory!.reported_developments).toHaveLength(1);
    expect(state.memory!.reported_developments[0]!.text).toBe(
      "A new model shipped.",
    );
    expect(state.memory!.reported_developments[0]!.id).toBeTruthy();
  });

  it("marks the report failed when a pipeline stage throws", async () => {
    const { store, state } = makeMemoryStore();

    const result = await runReportPipeline({
      llm: makeFakeLlm({ report_draft: new Error("model unavailable") }),
      store,
      topic,
      reportId: "report-2",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("model unavailable");
    expect(state.completed).toBeNull();
    expect(state.failed).toContain("model unavailable");
  });

  it("persists usage on completion when a collector is provided", async () => {
    const { store, state } = makeMemoryStore();
    const savedUsage: unknown[] = [];
    store.saveUsage = async (_reportId, usage) => {
      savedUsage.push(usage);
    };

    const usage = createUsageCollector();
    usage.record("gpt-5-mini", { input_tokens: 100, output_tokens: 20 }, 1);

    const result = await runReportPipeline({
      llm: makeFakeLlm(),
      store,
      topic,
      reportId: "report-usage",
      imageFetcher: async () => null,
      usage,
    });

    expect(result.ok).toBe(true);
    expect(state.completed).not.toBeNull();
    expect(savedUsage).toHaveLength(1);
    expect(savedUsage[0]).toMatchObject({
      web_search_calls: 1,
      by_model: { "gpt-5-mini": { input_tokens: 100 } },
    });
  });

  it("persists the prompt trace on completion when a collector is provided", async () => {
    const { store, state } = makeMemoryStore();
    const savedTraces: unknown[] = [];
    store.saveTrace = async (_reportId, trace) => {
      savedTraces.push(trace);
    };

    const trace = createTraceCollector();
    trace.record({
      stage: "search_plan",
      tier: "search",
      model: "gpt-5-mini",
      instructions: "plan",
      input: "topic",
      used_web_search: false,
      web_search_calls: 0,
      input_tokens: 10,
      output_tokens: 5,
      started_at: "2026-07-26T08:00:00Z",
      duration_ms: 900,
    });

    const result = await runReportPipeline({
      llm: makeFakeLlm(),
      store,
      topic,
      reportId: "report-trace",
      imageFetcher: async () => null,
      trace,
    });

    expect(result.ok).toBe(true);
    expect(state.completed).not.toBeNull();
    expect(savedTraces).toHaveLength(1);
    expect(savedTraces[0]).toMatchObject({
      calls: [{ index: 1, stage: "search_plan" }],
    });
  });

  it("does not fail the report when only the memory update throws", async () => {
    const { store, state } = makeMemoryStore();

    const result = await runReportPipeline({
      llm: makeFakeLlm({ memory_update: new Error("memory oops") }),
      store,
      topic,
      reportId: "report-3",
      imageFetcher: async () => null,
    });

    expect(result.ok).toBe(true);
    expect(state.completed).not.toBeNull();
    expect(state.failed).toBeNull();
    expect(state.memory).toBeNull();
  });
});
