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

export async function runAnalyst(
  llm: Llm,
  topic: Topic,
  sections: ReportSections,
  focus: string,
  extracts: AnalystSourceSummary[],
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
      "- The latest development and report",
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
      "- Refine, qualify, or challenge the primary assessment where appropriate.",
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
    }),
  });

  return { analysis: { commentary: result.commentary.trim() } };
}
