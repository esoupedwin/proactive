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
import type { Llm } from "@/lib/ai/llm";
import { createTraceCollector } from "@/lib/ai/trace";
import { createUsageCollector } from "@/lib/ai/usage";
import type {
  ExtractRecord,
  KnowledgeFact,
  ReportSections,
  Topic,
} from "@/lib/types";

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
  last_read_at: null,
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

  it("a cut-off run leaves a trace note and a truncation flag", async () => {
    const store = createInMemoryExtractStore();
    const trace = createTraceCollector();
    await runInfoTracker({
      store,
      exa: { search: vi.fn(async () => []) },
      topic,
      trace,
      maxTurns: 4,
      modelProvider: failingProvider(),
    });

    // The abort happens in the runner, so without the note the activity page
    // would show a tidy list of calls and no sign the agent was stopped.
    const notes = trace.snapshot().notes!;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ agent: "info-tracker", max_turns: 4 });

    const state = await store.getAgentState(topic.id, "tracker");
    expect(state.last_run_truncated).toBe(true);
    expect(state.last_run_error).toBeTruthy();
    // Not stamped: an unfinished run must still read as due, so the next
    // generate re-scans instead of skipping on the staleness check.
    expect(state.last_run_at).toBeUndefined();
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

describe("reporter situation (question mode)", () => {
  const questionTopic: Topic = {
    ...topic,
    id: "topic-q",
    watch_mode: "question",
    analytical_question:
      "Will Republicans retain control of both chambers after the 2026 midterms?",
    interest_frame: [
      { name: "Senate map", key_question: "", indicators: [] },
    ],
  };

  const seatFact: KnowledgeFact = {
    fact: "Republicans hold 53 Senate seats.",
    kind: "state",
    entities: ["Republicans"],
    confidence: "high",
    source_note: "Senate.gov",
    as_of: "2026-08-01",
  };
  const ruleFact: KnowledgeFact = {
    fact: "A party needs 51 seats, or 50 plus the Vice President, to control the Senate.",
    kind: "rule",
    entities: ["Senate"],
    confidence: "high",
    source_note: "Senate.gov",
    as_of: null,
  };

  /** An Llm whose only job is to answer the situation pre-step. */
  function situationLlm(facts: KnowledgeFact[]) {
    const calls: { schemaName: string; useWebSearch?: boolean }[] = [];
    const llm: Llm = {
      async structured(options) {
        calls.push({
          schemaName: options.schemaName,
          useWebSearch: options.useWebSearch,
        });
        return { facts } as never;
      },
    };
    return { llm, calls };
  }

  function questionFinal(overrides: object = {}) {
    return finalMessage({
      verdict: {
        answer: "Likely to retain both.",
        likelihood: "likely",
        confidence: "medium",
        trend: "baseline",
        rationale: [{ text: "Map favours incumbents.", extract_ids: [] }],
      },
      factor_assessments: [],
      situation_updates: [],
      what_changed: [{ text: "Initial assessment.", extract_ids: [] }],
      no_meaningful_change: false,
      summary: "Baseline",
      cover_extract_id: null,
      key_subtopics: [],
      ...overrides,
    });
  }

  it("establishes the facts with one web-search call on the first run and snapshots them into the report", async () => {
    const store = createInMemoryExtractStore();
    const { llm, calls } = situationLlm([ruleFact, seatFact]);
    const { persistence, state, stages } = makeMemoryPersistence();

    const result = await runReporter({
      persistence,
      store,
      topic: questionTopic,
      reportId: "report-q1",
      llm,
      modelProvider: fakeProvider([
        [functionCall("get_new_extracts", {}, "c1")],
        [questionFinal()],
      ]),
    });

    expect(result.ok).toBe(true);
    // Exactly one pre-step call, with search, before the agent loop ran.
    expect(calls).toEqual([{ schemaName: "situation", useWebSearch: true }]);
    expect(stages).toContain("Establishing the situation");
    expect(await store.getTopicFacts(questionTopic.id)).toEqual([
      ruleFact,
      seatFact,
    ]);
    // Rules first, then state, each with its as-of date.
    expect(state.completed?.sections.current_state).toEqual([
      { fact: ruleFact.fact, kind: "rule", as_of: null },
      { fact: seatFact.fact, kind: "state", as_of: "2026-08-01" },
    ]);
  });

  it("never searches again once the facts exist", async () => {
    const store = createInMemoryExtractStore();
    await store.saveTopicFacts(questionTopic, [ruleFact, seatFact]);
    const { llm, calls } = situationLlm([]);
    const { persistence, state } = makeMemoryPersistence();

    await runReporter({
      persistence,
      store,
      topic: questionTopic,
      reportId: "report-q2",
      llm,
      modelProvider: fakeProvider([
        [functionCall("get_new_extracts", {}, "c1")],
        [questionFinal()],
      ]),
    });

    expect(calls).toEqual([]);
    expect(state.completed?.sections.current_state).toHaveLength(2);
  });

  it("ignores legacy kind-less facts and establishes the real situation over them", async () => {
    // A topic switched from monitor to question mode carries the old
    // pipeline's "AP reports…" entries in topic_memory.facts. They are
    // developments, not a situation, and must not suppress the pre-step.
    const store = createInMemoryExtractStore();
    store.facts.set(questionTopic.id, [
      {
        fact: "AP reports a candidate announced a Senate run.",
        entities: ["AP"],
        confidence: "medium",
        source_note: "seed",
      },
    ]);
    const { llm, calls } = situationLlm([ruleFact]);
    const { persistence, state } = makeMemoryPersistence();

    await runReporter({
      persistence,
      store,
      topic: questionTopic,
      reportId: "report-q6",
      llm,
      modelProvider: fakeProvider([
        [functionCall("get_new_extracts", {}, "c1")],
        [questionFinal()],
      ]),
    });

    expect(calls).toHaveLength(1);
    expect(await store.getTopicFacts(questionTopic.id)).toEqual([ruleFact]);
    expect(state.completed?.sections.current_state).toEqual([
      { fact: ruleFact.fact, kind: "rule", as_of: null },
    ]);
  });

  it("does not establish facts for a monitor topic", async () => {
    const store = createInMemoryExtractStore();
    const { llm, calls } = situationLlm([seatFact]);
    const { persistence, state } = makeMemoryPersistence();

    await runReporter({
      persistence,
      store,
      topic,
      reportId: "report-m1",
      llm,
      modelProvider: fakeProvider([
        [functionCall("get_new_extracts", {}, "c1")],
        [
          finalMessage({
            latest_developments: [],
            community_reaction: [],
            practitioner_view: [],
            cross_source_takeaway: [],
            what_changed: [{ text: "baseline", extract_ids: [] }],
            no_meaningful_change: false,
            summary: "s",
            cover_extract_id: null,
            key_subtopics: [],
          }),
        ],
      ]),
    });

    expect(calls).toEqual([]);
    expect(await store.getTopicFacts(topic.id)).toEqual([]);
    expect(state.completed?.sections.current_state).toBeUndefined();
  });

  it("revises a state fact from cited evidence and persists the revision", async () => {
    const store = createInMemoryExtractStore();
    await store.saveTopicFacts(questionTopic, [ruleFact, seatFact]);
    const { extract } = await store.createExtract(questionTopic, {
      source_type: "news",
      title: "Democrat wins Ohio special election",
      publisher: "AP",
      url: "https://example.com/ohio",
      published_at: "2026-08-20",
      factor: "Senate map",
      gist: "Senate now 52-48.",
      relevance: "Changes the arithmetic",
      novelty: "new",
      contradiction: "",
    });
    const { llm } = situationLlm([]);
    const { persistence, state } = makeMemoryPersistence();

    await runReporter({
      persistence,
      store,
      topic: questionTopic,
      reportId: "report-q3",
      llm,
      modelProvider: fakeProvider([
        [functionCall("get_new_extracts", {}, "c1")],
        [
          questionFinal({
            situation_updates: [
              {
                fact: seatFact.fact,
                revised_fact: "Republicans hold 52 Senate seats.",
                as_of: "2026-08-20",
                extract_ids: [extract.id],
              },
              // Cites nothing this run served — must be ignored.
              {
                fact: ruleFact.fact,
                revised_fact: "A party needs 60 seats.",
                as_of: null,
                extract_ids: ["not-served"],
              },
            ],
          }),
        ],
      ]),
    });

    const facts = await store.getTopicFacts(questionTopic.id);
    expect(facts[0]).toEqual(ruleFact);
    expect(facts[1]!.fact).toBe("Republicans hold 52 Senate seats.");
    expect(facts[1]!.as_of).toBe("2026-08-20");
    expect(state.completed?.sections.current_state?.[1]).toEqual({
      fact: "Republicans hold 52 Senate seats.",
      kind: "state",
      as_of: "2026-08-20",
      revised: true,
    });
  });

  it("ignores a revision whose evidence was never served, even for a state fact", async () => {
    const store = createInMemoryExtractStore();
    await store.saveTopicFacts(questionTopic, [seatFact]);
    const { llm } = situationLlm([]);
    const { persistence } = makeMemoryPersistence();

    await runReporter({
      persistence,
      store,
      topic: questionTopic,
      reportId: "report-q4",
      llm,
      modelProvider: fakeProvider([
        [functionCall("get_new_extracts", {}, "c1")],
        [
          questionFinal({
            situation_updates: [
              {
                fact: seatFact.fact,
                revised_fact: "Republicans hold 40 Senate seats.",
                as_of: null,
                extract_ids: ["hallucinated"],
              },
            ],
          }),
        ],
      ]),
    });

    expect(await store.getTopicFacts(questionTopic.id)).toEqual([seatFact]);
  });

  it("still assesses when establishing the situation fails", async () => {
    const store = createInMemoryExtractStore();
    const llm: Llm = {
      async structured() {
        throw new Error("search unavailable");
      },
    };
    const { persistence, state } = makeMemoryPersistence();

    const result = await runReporter({
      persistence,
      store,
      topic: questionTopic,
      reportId: "report-q5",
      llm,
      modelProvider: fakeProvider([
        [functionCall("get_new_extracts", {}, "c1")],
        [questionFinal()],
      ]),
    });

    expect(result.ok).toBe(true);
    expect(state.failed).toBeNull();
    expect(state.completed?.sections.current_state).toBeUndefined();
    expect(await store.getTopicFacts(questionTopic.id)).toEqual([]);
  });
});
