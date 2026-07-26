import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emptyTopicMemory,
  type Extract,
  type Report,
  type ReportSections,
  type ReportTrace,
  type ReportUsage,
  type Topic,
  type TopicMemory,
} from "../types";
import { dedupeExtracts } from "./dedupe";
import { extractSources } from "./extractor";
import { findHeroImage, type ImageFetcher } from "./images";
import type { TraceCollector } from "./trace";
import type { UsageCollector } from "./usage";
import type { Llm } from "./llm";
import { updateTopicMemory } from "./memory";
import { planSearches } from "./planner";
import { generateReportDraft, sanitizeDraft } from "./reporter";
import { seekAll } from "./seeker";

/**
 * Persistence boundary for the pipeline. The real implementation is backed by
 * Supabase; tests use an in-memory implementation.
 */
export interface ReportStore {
  /** Optional: record the pipeline's current stage for live progress UI. */
  setStage?(reportId: string, stage: string): Promise<void>;
  /** Optional: persist OpenAI usage/cost for the run. */
  saveUsage?(reportId: string, usage: ReportUsage): Promise<void>;
  /** Optional: persist the LLM prompt/call trace for the run. */
  saveTrace?(reportId: string, trace: ReportTrace): Promise<void>;
  getTopicMemory(topicId: string): Promise<TopicMemory | null>;
  getLatestReadyReport(topicId: string): Promise<Report | null>;
  saveSources(reportId: string, topic: Topic, extracts: Extract[]): Promise<void>;
  completeReport(
    reportId: string,
    sections: ReportSections,
    summary: string,
  ): Promise<void>;
  failReport(reportId: string, message: string): Promise<void>;
  saveTopicMemory(memory: TopicMemory): Promise<void>;
  markTopicGenerated(topicId: string): Promise<void>;
}

export interface PipelineResult {
  ok: boolean;
  sections?: ReportSections;
  summary?: string;
  error?: string;
}

/**
 * Runs the full update workflow for one topic against an already-created
 * report row (status 'generating'):
 * plan → seek → extract → dedupe → report → persist → update memory.
 */
export async function runReportPipeline(options: {
  llm: Llm;
  store: ReportStore;
  topic: Topic;
  reportId: string;
  /** Override the og:image fetcher (tests use a stub to avoid network). */
  imageFetcher?: ImageFetcher;
  /** Collector shared with the Llm instance; persisted on completion. */
  usage?: UsageCollector;
  /** Prompt-flow collector shared with the Llm instance; persisted on completion. */
  trace?: TraceCollector;
}): Promise<PipelineResult> {
  const { llm, store, topic, reportId, imageFetcher, usage, trace } = options;

  const persistUsage = async () => {
    try {
      if (usage && store.saveUsage) {
        await store.saveUsage(reportId, usage.snapshot());
      }
      if (trace && store.saveTrace) {
        await store.saveTrace(reportId, trace.snapshot());
      }
    } catch (err) {
      console.error("saving usage/trace failed", err);
    }
  };

  // Progress reporting is best-effort — never let it break the pipeline.
  const setStage = (stage: string) => {
    store.setStage?.(reportId, stage).catch(() => {});
  };

  try {
    const memory =
      (await store.getTopicMemory(topic.id)) ??
      emptyTopicMemory(topic.id, topic.user_id);
    const previousReport = await store.getLatestReadyReport(topic.id);

    setStage("Planning search queries");
    const plan = await planSearches(llm, topic);

    const found = await seekAll(llm, topic, plan, (channel) =>
      setStage(
        channel === "news"
          ? "Searching news sources"
          : channel === "reddit"
            ? "Searching Reddit discussions"
            : "Searching Medium articles",
      ),
    );

    setStage("Extracting key information");
    const extracts = await extractSources(llm, topic, found, memory);
    const deduped = dedupeExtracts(extracts);

    setStage("Writing your briefing");
    const draft = await generateReportDraft(
      llm,
      topic,
      deduped,
      memory,
      previousReport,
    );
    const clean = sanitizeDraft(draft, deduped.length);

    const sections: ReportSections = {
      latest_developments: clean.latest_developments,
      community_reaction: clean.community_reaction,
      practitioner_view: clean.practitioner_view,
      cross_source_takeaway: clean.cross_source_takeaway,
      what_changed: clean.what_changed,
      no_meaningful_change: clean.no_meaningful_change,
    };

    // Best-effort cover image from the most-cited source — never fails the run.
    if (deduped.length > 0) {
      setStage("Selecting a cover image");
      try {
        sections.hero_image = await findHeroImage(deduped, sections, imageFetcher);
      } catch (err) {
        console.error("cover image selection failed", err);
      }
    }

    await store.saveSources(reportId, topic, deduped);
    await store.completeReport(reportId, sections, clean.summary);
    await store.markTopicGenerated(topic.id);

    // Memory failure should not fail an already-completed report.
    try {
      setStage("Updating topic memory");
      const newMemory = await updateTopicMemory(llm, topic, memory, clean, deduped);
      await store.saveTopicMemory(newMemory);
    } catch (err) {
      console.error("memory update failed", err);
    }

    await persistUsage();
    return { ok: true, sections, summary: clean.summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("report pipeline failed", err);
    await store.failReport(reportId, message);
    // Failed runs still cost tokens — record what was spent.
    await persistUsage();
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

export function createSupabaseReportStore(
  supabase: SupabaseClient,
): ReportStore {
  return {
    async setStage(reportId, stage) {
      await supabase.from("reports").update({ stage }).eq("id", reportId);
    },

    async saveUsage(reportId, usage) {
      const { error } = await supabase
        .from("reports")
        .update({ usage })
        .eq("id", reportId);
      if (error) throw new Error(`saving usage failed: ${error.message}`);
    },

    async saveTrace(reportId, trace) {
      const { error } = await supabase
        .from("reports")
        .update({ trace })
        .eq("id", reportId);
      if (error) throw new Error(`saving trace failed: ${error.message}`);
    },

    async getTopicMemory(topicId) {
      const { data } = await supabase
        .from("topic_memory")
        .select("*")
        .eq("topic_id", topicId)
        .maybeSingle();
      return (data as TopicMemory | null) ?? null;
    },

    async getLatestReadyReport(topicId) {
      const { data } = await supabase
        .from("reports")
        .select("*")
        .eq("topic_id", topicId)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as Report | null) ?? null;
    },

    async saveSources(reportId, topic, extracts) {
      if (extracts.length === 0) return;
      const { error } = await supabase.from("sources").insert(
        extracts.map((e) => ({
          report_id: reportId,
          topic_id: topic.id,
          user_id: topic.user_id,
          source_type: e.source_type,
          title: e.title,
          publisher: e.publisher || null,
          url: e.url,
          published_at: e.published_at || null,
          gist: e.gist,
          relevance: e.relevance || null,
          novelty: e.novelty,
          contradiction: e.contradiction || null,
        })),
      );
      if (error) throw new Error(`saving sources failed: ${error.message}`);
    },

    async completeReport(reportId, sections, summary) {
      const { error } = await supabase
        .from("reports")
        .update({
          status: "ready",
          sections,
          summary,
          stage: null,
          error: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", reportId);
      if (error) throw new Error(`completing report failed: ${error.message}`);
    },

    async failReport(reportId, message) {
      await supabase
        .from("reports")
        .update({
          status: "error",
          error: message,
          stage: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", reportId);
    },

    async saveTopicMemory(memory) {
      const { error } = await supabase.from("topic_memory").upsert({
        topic_id: memory.topic_id,
        user_id: memory.user_id,
        reported_developments: memory.reported_developments,
        themes: memory.themes,
        facts: memory.facts,
        open_questions: memory.open_questions,
        updated_at: memory.updated_at,
      });
      if (error) throw new Error(`saving memory failed: ${error.message}`);
    },

    async markTopicGenerated(topicId) {
      await supabase
        .from("topics")
        .update({ last_generated_at: new Date().toISOString() })
        .eq("id", topicId);
    },
  };
}
