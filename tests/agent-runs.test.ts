import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  Usage,
  type Model,
  type ModelProvider,
  type ModelResponse,
} from "@openai/agents";
import { createInMemoryExtractStore } from "@/lib/agents/extract-store";
import type { ReporterPersistence } from "@/lib/agents/report-store";
import { runReporter } from "@/lib/agents/reporter/run";
import { runInfoTracker } from "@/lib/agents/tracker/run";
import { createTraceCollector } from "@/lib/ai/trace";
import { createUsageCollector } from "@/lib/ai/usage";
import type { ExtractRecord, ReportSections, Topic } from "@/lib/types";

/**
 * End-to-end agent runs against a scripted fake model — verifies the full
 * loop (tool dispatch → store writes → final output → persistence → memory)
 * without any network.
 */

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

type OutputItem = Record<string, unknown>;

function functionCall(name: string, args: object, callId: string): OutputItem {
  return {
    type: "function_call",
    callId,
    name,
    arguments: JSON.stringify(args),
    status: "completed",
  };
}

function finalMessage(payload: object): OutputItem {
  return {
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: JSON.stringify(payload) }],
  };
}

/** Plays back a scripted sequence of model turns. */
function makeFakeModel(turns: OutputItem[][]): Model {
  let turn = 0;
  return {
    async getResponse(): Promise<ModelResponse> {
      const output = turns[Math.min(turn, turns.length - 1)] ?? [];
      turn += 1;
      return {
        usage: new Usage({
          input_tokens: 100,
          output_tokens: 20,
          total_tokens: 120,
        }),
        output: output as ModelResponse["output"],
      };
    },
    // eslint-disable-next-line require-yield
    async *getStreamedResponse() {
      throw new Error("streaming not supported in tests");
    },
  } as Model;
}

// Injected via each run function's modelProvider test seam.
function fakeProvider(turns: OutputItem[][]): ModelProvider {
  const model = makeFakeModel(turns);
  return { getModel: () => model };
}

function failingProvider(): ModelProvider {
  return {
    getModel: () =>
      ({
        async getResponse(): Promise<ModelResponse> {
          throw new Error("model unavailable");
        },
        // eslint-disable-next-line require-yield
        async *getStreamedResponse() {
          throw new Error("model unavailable");
        },
      }) as Model,
  };
}

function makeMemoryPersistence() {
  const stages: string[] = [];
  const state: {
    completed: { sections: ReportSections; summary: string } | null;
    failed: string | null;
    sources: ExtractRecord[];
    topicGenerated: boolean;
  } = { completed: null, failed: null, sources: [], topicGenerated: false };

  const persistence: ReporterPersistence = {
    async setStage(_reportId, stage) {
      stages.push(stage);
    },
    async getLatestReadyReport() {
      return null;
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
    async markTopicGenerated() {
      state.topicGenerated = true;
    },
  };
  return { persistence, stages, state };
}

beforeAll(() => {
  // initAgentsSdk() constructs a real OpenAI client (never called thanks to
  // the fake model provider) — it just needs a key to exist.
  process.env.OPENAI_API_KEY = "test-key";
});

describe("info tracker run", () => {
  it("records extracts via tools and persists subtopic memory", async () => {
    const store = createInMemoryExtractStore();
    const modelProvider = fakeProvider([
      [
        functionCall(
          "record_extract",
          {
            source_type: "news",
            title: "Agents SDK 1.0",
            publisher: "TechNews",
            url: "https://example.com/sdk-1-0",
            published_at: "2026-08-01",
            factor: "frameworks",
            gist: "The SDK hit 1.0.",
            relevance: "Framework milestone",
            novelty: "new",
            contradiction: "",
          },
          "call-1",
        ),
      ],
      [
        finalMessage({
          new_extracts: 1,
          merged_extracts: 0,
          key_subtopics: ["sdk releases"],
          notes: "",
        }),
      ],
    ]);

    const usage = createUsageCollector();
    const trace = createTraceCollector();
    const result = await runInfoTracker({
      store,
      exa: { search: vi.fn(async () => []) },
      topic,
      usage,
      trace,
      modelProvider,
    });

    expect(result.ok).toBe(true);
    expect(result.newExtracts).toBe(1);
    expect(store.extracts).toHaveLength(1);
    expect(store.extracts[0]!.title).toBe("Agents SDK 1.0");
    expect(await store.getAgentState(topic.id, "tracker")).toMatchObject({
      recent_subtopics: ["sdk releases"],
    });
    // Two model turns + one tool call recorded.
    expect(usage.snapshot().calls).toBe(2);
    const stages = trace.snapshot().calls.map((c) => c.stage);
    expect(stages).toContain("tool:record_extract");
  });

  it("returns ok:false instead of throwing when the run fails", async () => {
    const store = createInMemoryExtractStore();
    const result = await runInfoTracker({
      store,
      exa: { search: vi.fn(async () => []) },
      topic,
      modelProvider: failingProvider(),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("reporter run", () => {
  it("reads new extracts, assesses, composes, persists, and advances the cursor", async () => {
    const store = createInMemoryExtractStore();
    const { extract } = await store.createExtract(topic, {
      source_type: "news",
      title: "Agents SDK 1.0",
      publisher: "TechNews",
      url: "https://example.com/sdk-1-0",
      published_at: "2026-08-01",
      factor: null,
      gist: "The SDK hit 1.0.",
      relevance: "Framework milestone",
      novelty: "new",
      contradiction: "",
    });

    const modelProvider = fakeProvider([
      [functionCall("get_new_extracts", {}, "call-1")],
      [
        functionCall(
          "record_assessment",
          {
            extract_id: extract.id,
            assessment: "Major milestone for the ecosystem.",
            significance: "high",
          },
          "call-2",
        ),
      ],
      [
        finalMessage({
          latest_developments: [
            { text: "The **Agents SDK** hit 1.0", extract_ids: [extract.id] },
          ],
          community_reaction: [],
          practitioner_view: [],
          cross_source_takeaway: ["The ecosystem is maturing."],
          what_changed: [
            { text: "Initial briefing baseline", extract_ids: [] },
          ],
          no_meaningful_change: false,
          summary: "SDK 1.0 shipped",
          cover_extract_id: extract.id,
          key_subtopics: ["sdk releases"],
        }),
      ],
    ]);

    const { persistence, state } = makeMemoryPersistence();
    const usage = createUsageCollector();
    const result = await runReporter({
      persistence,
      store,
      topic,
      reportId: "report-1",
      usage,
      imageFetcher: async () => null,
      modelProvider,
    });

    expect(result.ok).toBe(true);
    expect(state.failed).toBeNull();
    expect(state.completed?.summary).toBe("SDK 1.0 shipped");
    expect(
      state.completed?.sections.latest_developments[0]?.source_refs,
    ).toEqual([0]);
    expect(state.sources.map((e) => e.id)).toEqual([extract.id]);
    expect(state.topicGenerated).toBe(true);
    expect(store.assessments).toHaveLength(1);
    expect(store.assessments[0]!.report_id).toBe("report-1");
    const reporterState = await store.getAgentState(topic.id, "reporter");
    expect(reporterState.cursor).toBe(extract.created_at);
    expect(reporterState.recent_subtopics).toEqual(["sdk releases"]);
  });

  it("fails the report row when the agent produces no output", async () => {
    const store = createInMemoryExtractStore();
    const { persistence, state } = makeMemoryPersistence();
    const result = await runReporter({
      persistence,
      store,
      topic,
      reportId: "report-2",
      modelProvider: failingProvider(),
    });
    expect(result.ok).toBe(false);
    expect(state.failed).toBeTruthy();
    // A failed run must not advance the cursor.
    expect(await store.getAgentState(topic.id, "reporter")).toEqual({});
  });
});
