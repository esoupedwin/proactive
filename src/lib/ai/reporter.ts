import type {
  DetailLevel,
  Extract,
  Report,
  Topic,
  TopicMemory,
} from "../types";
import type { Llm } from "./llm";
import { ReportDraftSchema, type ReportDraft } from "./schemas";

const DETAIL_GUIDANCE: Record<DetailLevel, string> = {
  brief: "The user wants BRIEF updates: at most 3 bullets per section, one line each.",
  standard: "The user wants STANDARD detail: 3-5 concise bullets per section.",
  deep: "The user wants DEEP detail: up to 7 bullets per section, still concise but with more specifics.",
};

/**
 * Update reporter — reads new extracts, the previous report, topic memory and
 * user preferences, and produces the structured report.
 */
export async function generateReportDraft(
  llm: Llm,
  topic: Topic,
  extracts: Extract[],
  memory: TopicMemory,
  previousReport: Report | null,
): Promise<ReportDraft> {
  const today = new Date().toISOString();

  return llm.structured({
    tier: "report",
    schema: ReportDraftSchema,
    schemaName: "report_draft",
    instructions: [
      "You are the update reporter for Proactive, a personal research companion. You write a compact intelligence briefing, not a news digest.",
      DETAIL_GUIDANCE[topic.detail_level],
      "",
      "Reporting rules:",
      "- Focus on what is NEW since the previous report; do not summarize every source.",
      "- Never repeat facts already reported unless there is a meaningful update — and then frame it as an update.",
      "- Use news sources for reported developments; Reddit for community reaction and emerging discussion (never present as verified fact); Medium for practitioner interpretation (not authoritative by default).",
      "- Distinguish confirmed developments from speculation, and explicitly state uncertainty (e.g. 'reportedly', 'unconfirmed').",
      "- Surface disagreements between sources when they exist.",
      "- Every bullet MUST cite supporting sources via source_refs (indexes into the provided sources array). Never cite an index that does not exist.",
      "- Never invent URLs, quotations, dates, or claims not present in the extracts.",
      "- 'what_changed' compares against the PREVIOUS report: what is new, what narrative shifted, what earlier conclusion should be revised. For a first report, state that this is the initial briefing baseline.",
      "- cross_source_takeaway is 2-4 sentences synthesizing across all three channels.",
      "",
      "Before finalizing, ask yourself: What did the previous report tell the user? What is genuinely new? Has the narrative changed? Is there contradictory evidence? Should an earlier conclusion be revised? Is this update important enough to surface?",
      "If nothing meaningful changed, set no_meaningful_change to true and keep the report minimal (you may leave sections empty except what_changed explaining that nothing significant happened).",
    ].join("\n"),
    input: JSON.stringify(
      {
        now: today,
        topic: {
          title: topic.title,
          goal: topic.description,
          interest_areas: topic.interest_areas,
        },
        // Index in this array == source_refs index.
        sources: extracts.map((e, i) => ({ index: i, ...e })),
        previous_report: previousReport?.sections ?? null,
        previous_report_date: previousReport?.created_at ?? null,
        memory: {
          already_reported: memory.reported_developments.map((d) => d.text),
          themes: memory.themes,
          facts: memory.facts,
          open_questions: memory.open_questions,
        },
      },
      null,
      2,
    ),
  });
}

/** Drops bullets whose source_refs point outside the extracts array (anti-hallucination guard). */
export function sanitizeDraft(draft: ReportDraft, sourceCount: number): ReportDraft {
  const clampBullets = (bullets: ReportDraft["latest_developments"]) =>
    bullets
      .map((b) => ({
        ...b,
        source_refs: b.source_refs.filter((r) => r >= 0 && r < sourceCount),
      }))
      // A factual bullet with no surviving citation is dropped, unless there
      // are no sources at all (e.g. "what changed" narrative on empty runs).
      .filter((b) => b.source_refs.length > 0 || sourceCount === 0);

  return {
    ...draft,
    latest_developments: clampBullets(draft.latest_developments),
    community_reaction: clampBullets(draft.community_reaction),
    practitioner_view: clampBullets(draft.practitioner_view),
    // what_changed may legitimately reference nothing (narrative comparison).
    what_changed: draft.what_changed.map((b) => ({
      ...b,
      source_refs: b.source_refs.filter((r) => r >= 0 && r < sourceCount),
    })),
  };
}
