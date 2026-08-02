import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExtractRecord,
  Report,
  ReportSections,
  ReportTrace,
  ReportUsage,
  Topic,
} from "../types";

/**
 * Report-row persistence for the Reporter agent — the same lifecycle the UI
 * already watches (status generating→ready|error, free-text stage strings).
 * Supabase-backed in production; tests use an in-memory implementation.
 */
export interface ReporterPersistence {
  /** Optional: record the run's current stage for live progress UI. */
  setStage?(reportId: string, stage: string): Promise<void>;
  saveUsage?(reportId: string, usage: ReportUsage): Promise<void>;
  saveTrace?(reportId: string, trace: ReportTrace): Promise<void>;
  getLatestReadyReport(topicId: string): Promise<Report | null>;
  /** Persists the report's ordered sources snapshot (citation index space). */
  saveSources(
    reportId: string,
    topic: Topic,
    extracts: ExtractRecord[],
  ): Promise<void>;
  completeReport(
    reportId: string,
    sections: ReportSections,
    summary: string,
  ): Promise<void>;
  failReport(reportId: string, message: string): Promise<void>;
  markTopicGenerated(topicId: string): Promise<void>;
}

export function createSupabaseReporterPersistence(
  supabase: SupabaseClient,
): ReporterPersistence {
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
      // Explicit millisecond offsets keep the UI's `.order("created_at")`
      // deterministic — array index IS the citation number.
      const base = Date.now();
      const { error } = await supabase.from("sources").insert(
        extracts.map((e, i) => ({
          report_id: reportId,
          topic_id: topic.id,
          user_id: topic.user_id,
          source_type: e.source_type,
          title: e.title,
          publisher: e.publisher,
          url: e.url,
          published_at: e.published_at,
          gist: e.gist,
          relevance: e.relevance,
          novelty: e.novelty,
          contradiction: e.contradiction,
          created_at: new Date(base + i).toISOString(),
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

    async markTopicGenerated(topicId) {
      await supabase
        .from("topics")
        .update({ last_generated_at: new Date().toISOString() })
        .eq("id", topicId);
    },
  };
}
