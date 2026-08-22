import { Runner, type ModelProvider } from "@openai/agents";
import { findHeroImage, type ImageFetcher } from "../../ai/images";
import type { Llm } from "../../ai/llm";
import type { TraceCollector } from "../../ai/trace";
import type { UsageCollector } from "../../ai/usage";
import type {
  Extract,
  ExtractRecord,
  KnowledgeFact,
  ReportSections,
  Topic,
} from "../../types";
import {
  createOpenAiModelProvider,
  initAgentsSdk,
  reporterModel,
} from "../client";
import type { ExtractStore } from "../extract-store";
import type { ReporterPersistence } from "../report-store";
import type {
  QuestionReporterFinal,
  ReporterFinal,
  TrendingReporterFinal,
} from "../schemas";
import { createTracingModelProvider } from "../usage-adapter";
import { buildReporterAgent } from "./agent";
import {
  composeQuestionReport,
  composeReport,
  composeTrendingReport,
} from "./compose";
import {
  applySituationUpdates,
  establishSituation,
  situationSnapshot,
} from "./situation";
import type { ReporterToolDeps } from "./tools";

export interface ReporterRunResult {
  ok: boolean;
  sections?: ReportSections;
  summary?: string;
  error?: string;
}

// A turn is one model invocation; a first report over a full extract store
// legitimately needs many tool calls (searches + per-extract assessments).
// The instructions tell the agent to batch tool calls, so this is headroom,
// not an invitation to sprawl.
const DEFAULT_MAX_TURNS = 20;

/** Snapshot rows re-shaped for findHeroImage (pipeline Extract shape). */
function asExtract(e: ExtractRecord): Extract {
  return {
    source_type: e.source_type,
    title: e.title,
    publisher: e.publisher ?? "",
    url: e.url,
    published_at: e.published_at ?? "",
    gist: e.gist,
    relevance: e.relevance ?? "",
    novelty: e.novelty === "update" ? "update" : "new",
    contradiction: e.contradiction ?? "",
  };
}

/**
 * One Reporter run against an already-created report row (status
 * 'generating'): read new extracts → assess → write report → persist →
 * advance cursor. Mirrors the old pipeline's persistence choreography so the
 * UI (watcher, citations, experts) keeps working unchanged.
 */
export async function runReporter(options: {
  persistence: ReporterPersistence;
  store: ExtractStore;
  topic: Topic;
  reportId: string;
  /**
   * Question mode: used once, to establish the topic's standing facts with
   * a bounded web search before the first assessment. The agent loop never
   * searches; omit to skip establishing (the loop then runs without facts).
   */
  llm?: Llm;
  usage?: UsageCollector;
  trace?: TraceCollector;
  imageFetcher?: ImageFetcher;
  maxTurns?: number;
  /** Test seam — real runs default to the OpenAI provider. */
  modelProvider?: ModelProvider;
}): Promise<ReporterRunResult> {
  const { persistence, store, topic, reportId, usage, trace } = options;
  const startedAt = new Date().toISOString();
  const model = reporterModel();

  const persistUsage = async () => {
    try {
      if (usage && persistence.saveUsage) {
        await persistence.saveUsage(reportId, usage.snapshot());
      }
      if (trace && persistence.saveTrace) {
        await persistence.saveTrace(reportId, trace.snapshot());
      }
    } catch (err) {
      console.error("saving usage/trace failed", err);
    }
  };

  // Progress reporting is best-effort — never let it break the run.
  const setStage = (stage: string) => {
    persistence.setStage?.(reportId, stage).catch(() => {});
  };

  try {
    initAgentsSdk();
    setStage("Reviewing new information");

    const state = await store.getAgentState(topic.id, "reporter");
    const recentSubtopics = state.recent_subtopics ?? [];
    const previousReport = await persistence.getLatestReadyReport(topic.id);
    const feedback = await store.recentFeedback(topic.id, 5);

    const question = topic.watch_mode === "question";
    const trending = topic.watch_mode === "trending";

    // Question topics reason from standing facts. They are established once,
    // by the only web search the reporter ever makes; an empty base means a
    // first run (or the user cleared them). Failure is non-fatal — an
    // assessment without facts is still an assessment.
    let situation = question ? await store.getTopicFacts(topic.id) : [];
    if (question && situation.length === 0 && options.llm) {
      setStage("Establishing the situation");
      try {
        situation = await establishSituation(options.llm, topic);
        await store.saveTopicFacts(topic, situation);
      } catch (err) {
        console.error("establishing situation failed", err);
        situation = [];
      }
    }

    const deps: ReporterToolDeps = {
      store,
      topic,
      reportId,
      served: new Map(),
      cursorTracker: { maxServedCreatedAt: null },
    };
    const agent = buildReporterAgent({
      deps,
      model,
      recentSubtopics,
      situation,
      trace,
    });
    const input = JSON.stringify({
      now: startedAt,
      instruction: question
        ? "Assess the analytical question against the consolidated evidence. Start with get_new_extracts."
        : trending
          ? "Map what's currently gaining attention for this topic. Start with get_new_extracts."
          : "Bring the user up to date on this topic. Start with get_new_extracts.",
      previous_report: previousReport?.sections ?? null,
      previous_report_date: previousReport?.created_at ?? null,
      // Question mode: the verdict the trend must be judged against.
      previous_verdict: previousReport?.sections?.verdict ?? null,
      user_feedback: feedback.map((f) => ({
        rating: f.rating,
        comment: f.comment ?? "",
        about_report: f.report_summary ?? "",
        at: f.created_at,
      })),
    });

    setStage("Assessing what it means");
    // Model turns are traced live (usage-adapter), so the trace reads in
    // true chronological order: turn → its web searches → tool calls.
    const runner = new Runner({
      modelProvider: createTracingModelProvider({
        inner: options.modelProvider ?? createOpenAiModelProvider(),
        usage,
        trace,
        tier: "report",
        model,
        agentName: "reporter",
        instructions: agent.instructions as string,
        input,
      }),
    });
    const result = await runner.run(agent, input, {
      maxTurns: options.maxTurns ?? DEFAULT_MAX_TURNS,
    });

    const final = result.finalOutput as
      | ReporterFinal
      | QuestionReporterFinal
      | TrendingReporterFinal
      | undefined;
    if (!final) {
      throw new Error("reporter agent produced no final output");
    }

    setStage(
      question
        ? "Weighing the evidence"
        : trending
          ? "Mapping the attention"
          : "Writing your briefing",
    );
    const composed = question
      ? composeQuestionReport(final as QuestionReporterFinal, deps.served)
      : trending
        ? composeTrendingReport(final as TrendingReporterFinal, deps.served)
        : composeReport(final as ReporterFinal, deps.served);
    const sections = composed.sections;

    // Fold any evidence-backed revisions into the fact base, and snapshot
    // the base into the report so history shows what this verdict rested on.
    let revisedSituation: KnowledgeFact[] | null = null;
    if (question && situation.length > 0) {
      const updates = (final as QuestionReporterFinal).situation_updates.filter(
        // Same anti-hallucination guard as bullets: a revision must cite
        // extracts this run actually served.
        (u) => u.extract_ids.some((id) => deps.served.has(id)),
      );
      const applied = applySituationUpdates(situation, updates);
      if (applied.revised.size > 0) revisedSituation = applied.facts;
      sections.current_state = situationSnapshot(applied.facts, applied.revised);
    }

    // Best-effort cover image — never fails the run.
    if (composed.snapshot.length > 0 && !sections.no_meaningful_change) {
      setStage("Selecting a cover image");
      try {
        sections.hero_image = await findHeroImage(
          composed.snapshot.map(asExtract),
          sections,
          options.imageFetcher,
          composed.coverRef,
        );
      } catch (err) {
        console.error("cover image selection failed", err);
      }
    }

    await persistence.saveSources(reportId, topic, composed.snapshot);
    await persistence.completeReport(reportId, sections, composed.summary);
    await persistence.markTopicGenerated(topic.id);

    // Memory/cursor update must not fail an already-completed report.
    try {
      const cursor = deps.cursorTracker.maxServedCreatedAt ?? state.cursor;
      await store.saveAgentState(topic, "reporter", {
        recent_subtopics:
          final.key_subtopics.length > 0
            ? final.key_subtopics
            : recentSubtopics,
        ...(cursor ? { cursor } : {}),
        last_run_at: new Date().toISOString(),
      });
      if (revisedSituation) {
        await store.saveTopicFacts(topic, revisedSituation);
      }
    } catch (err) {
      console.error("reporter state update failed", err);
    }

    await persistUsage();
    return { ok: true, sections, summary: composed.summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("reporter run failed", err);
    await persistence.failReport(reportId, message);
    // Failed runs still cost tokens — record what was spent.
    await persistUsage();
    return { ok: false, error: message };
  }
}
