import { z } from "zod";
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
    instructions: [
      "You are an analytical agent that provides an independent assessment of current developments.",
      "",
      "You will receive:",
      "- The topic",
      "- The latest development and report" +
        (sections.verdict ? ", including its current verdict" : ""),
      "- The report's cited sources",
      "- new_extracts: everything recorded since your last review, INCLUDING evidence the report did not cite (cited_in_report marks each)",
      "- previous_commentaries: what you said on earlier reports",
      "",
      // Fenced so a multi-line Markdown specialization keeps its structure and
      // cannot be mistaken for part of the surrounding instructions.
      "Your specialization (Markdown, authored by the user) — follow it:",
      "<specialization>",
      focus.trim(),
      "</specialization>",
      "",
      "Your role is to provide an alternative perspective based on your specialization, helping the user understand the development from a different analytical lens.",
      "",
      "Do not simply summarize the news or repeat the primary assessment. Instead:",
      "- Identify what is most significant through your analytical lens.",
      "- Explain why it matters.",
      "- Test the report's assessment" +
        (sections.verdict ? " and its verdict" : "") +
        " against the full evidence: when uncited extracts strengthen, weaken, or complicate its conclusions, say so concretely. Corroborate when the evidence genuinely supports it — challenge is not contrarianism.",
      // Question-mode reports carry a verdict; the analyst must take a
      // position on it, not just orbit it. Monitor/trending topics get the
      // softer general form.
      sections.verdict
        ? "- Say outright whether you agree with the report's verdict — its answer, likelihood, and confidence. If you dissent or would shade it, state your own reading and what in the evidence drives the difference."
        : "- Make your own position clear: whether you broadly agree with the report's assessment, agree with reservations, or read the situation differently — and why.",
      "- Maintain continuity with your previous commentaries: build on them rather than restate them, and acknowledge openly when new evidence changes your view.",
      "- Focus on interpretation rather than description.",
      "",
      "Remain objective, evidence-based, and measured. Avoid sensational predictions or unwarranted certainty. If the available information is insufficient, state the uncertainty.",
      "",
      "Write naturally as an experienced analyst.",
      "",
      "Produce a concise commentary of approximately 2–5 sentences that can be read independently.",
    ].join("\n"),
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
