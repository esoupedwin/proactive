import { z } from "zod";
import { analystInstructions } from "../../prompts";
import type {
  AnalystCommentary,
  ReportSections,
  SourceType,
  Topic,
} from "../../types";
import type { Llm } from "../llm";
import { plainReportText } from "./report-text";

/**
 * Analyst — an independent commentator on each report. It reads the briefing
 * through the specialization the user gave it and writes a short, standalone
 * commentary: what is most significant through that lens, why it matters, and
 * where it would refine or challenge the report's own assessment.
 *
 * Unlike the report, the analyst also sees the raw extracts recorded since its
 * last review — including ones the report did NOT cite — so it can genuinely
 * test the report's conclusions against the evidence rather than paraphrase
 * them. Its prior commentaries are provided for continuity.
 */

export const AnalystSchema = z.object({
  commentary: z
    .string()
    .describe(
      "Approximately 2-5 sentences of standalone commentary through your analytical lens. Interpretation, not summary. Plain prose — no headings or bullet points.",
    ),
});

export interface AnalystSourceSummary {
  source_type: SourceType;
  gist: string;
  novelty: string;
  contradiction: string;
}

/** One raw extract recorded since the analyst's last review. */
export interface AnalystExtractSummary {
  source_type: SourceType;
  title: string;
  /** Interest-frame factor the tracker filed it under; null when none. */
  factor: string | null;
  /** When the source says it was published; null when unknown. */
  published_at: string | null;
  gist: string;
  novelty: string;
  contradiction: string;
  corroborations: number;
  /** Whether the report's own sources include this extract. */
  cited_in_report: boolean;
  recorded_at: string;
}

/** A commentary this analyst produced on an earlier report. */
export interface AnalystPriorCommentary {
  at: string;
  commentary: string;
}

export async function runAnalyst(
  llm: Llm,
  topic: Topic,
  sections: ReportSections,
  focus: string,
  extracts: AnalystSourceSummary[],
  newExtracts: AnalystExtractSummary[] = [],
  previousCommentaries: AnalystPriorCommentary[] = [],
): Promise<{ analysis: AnalystCommentary }> {
  const result = await llm.structured({
    // Report tier: reading a briefing against a lens and saying something the
    // report did not is genuine synthesis — model quality is the product.
    tier: "report",
    schema: AnalystSchema,
    schemaName: "analyst_analysis",
    // Text in lib/prompts.ts, the app-wide prompt catalog.
    instructions: analystInstructions(focus, Boolean(sections.verdict)),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      report: plainReportText(sections),
      // The report's own sources, so "evidence-based" has evidence to weigh:
      // reported fact vs community sentiment vs practitioner interpretation.
      sources: extracts,
      // The unfiltered record since the last review — the challenge material.
      new_extracts: newExtracts,
      previous_commentaries: previousCommentaries,
    }),
  });

  return { analysis: { commentary: result.commentary.trim() } };
}
