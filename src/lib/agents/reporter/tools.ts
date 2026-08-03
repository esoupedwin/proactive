import type { ExtractRecord, Topic } from "../../types";
import type { ExtractStore } from "../extract-store";
import type { RecordAssessmentParamsSchema } from "../schemas";
import type { z } from "zod";

/**
 * Pure tool implementations for the Reporter — the unit-test surface.
 * `served` accumulates every extract the agent has seen, so compose.ts can
 * resolve any id the agent cites; `cursorTracker` remembers how far the
 * new-extracts feed reached (persisted as the reporter's cursor on success).
 */

export interface ReporterToolDeps {
  store: ExtractStore;
  topic: Topic;
  reportId: string;
  /** Every extract returned by any tool this run, by id. */
  served: Map<string, ExtractRecord>;
  cursorTracker: { maxServedCreatedAt: string | null };
}

function summarize(e: ExtractRecord) {
  return {
    id: e.id,
    source_type: e.source_type,
    title: e.title,
    publisher: e.publisher ?? "",
    url: e.url,
    published_at: e.published_at ?? "unknown",
    factor: e.factor ?? "",
    gist: e.gist,
    relevance: e.relevance ?? "",
    novelty: e.novelty ?? "",
    contradiction: e.contradiction ?? "",
    corroborations: e.corroborations,
    recorded_at: e.created_at,
  };
}

export async function getNewExtracts(deps: ReporterToolDeps): Promise<string> {
  const state = await deps.store.getAgentState(deps.topic.id, "reporter");
  const rows = await deps.store.recentExtracts(deps.topic.id, {
    afterCreatedAt: state.cursor,
    limit: 40,
  });
  for (const row of rows) {
    deps.served.set(row.id, row);
    const t = deps.cursorTracker;
    if (!t.maxServedCreatedAt || row.created_at > t.maxServedCreatedAt) {
      t.maxServedCreatedAt = row.created_at;
    }
  }
  if (rows.length === 0) {
    return "No new extracts since your last report. If searching for context also finds nothing meaningful, this is a no-meaningful-change run.";
  }
  return JSON.stringify(rows.map(summarize));
}

export async function searchExtracts(
  deps: ReporterToolDeps,
  params: { query: string },
): Promise<string> {
  const rows = await deps.store.hybridSearch(deps.topic.id, params.query, 8);
  for (const row of rows) deps.served.set(row.id, row);
  if (rows.length === 0) return "No extracts match.";
  return JSON.stringify(rows.map(summarize));
}

export async function recordAssessment(
  deps: ReporterToolDeps,
  params: z.infer<typeof RecordAssessmentParamsSchema>,
): Promise<string> {
  if (!deps.served.has(params.extract_id)) {
    return "Unknown extract_id — only assess extracts returned by get_new_extracts or search_extracts.";
  }
  await deps.store.recordAssessment(deps.topic, {
    extract_id: params.extract_id,
    report_id: deps.reportId,
    assessment: params.assessment,
    significance: params.significance,
  });
  return "Assessment recorded.";
}

export async function getRecentAssessments(
  deps: ReporterToolDeps,
): Promise<string> {
  const rows = await deps.store.recentAssessments(deps.topic.id, 20);
  if (rows.length === 0) return "No prior assessments.";
  return JSON.stringify(
    rows.map((a) => ({
      extract_id: a.extract_id,
      assessment: a.assessment,
      significance: a.significance,
      at: a.created_at,
    })),
  );
}
