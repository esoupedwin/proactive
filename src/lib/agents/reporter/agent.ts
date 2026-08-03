import { Agent, tool } from "@openai/agents";
import type { TraceCollector } from "../../ai/trace";
import type { DetailLevel, Topic } from "../../types";
import { renderAnalyticalQuestion, renderInterestFrame } from "../frame";
import {
  EmptyParamsSchema,
  QuestionReporterFinalSchema,
  RecordAssessmentParamsSchema,
  ReporterFinalSchema,
  SearchExtractsParamsSchema,
} from "../schemas";
import { tracedToolCall } from "../usage-adapter";
import {
  getNewExtracts,
  getRecentAssessments,
  recordAssessment,
  searchExtracts,
  type ReporterToolDeps,
} from "./tools";

const DETAIL_GUIDANCE: Record<DetailLevel, string> = {
  brief:
    "The user wants BRIEF updates: at most 3 bullets per section, one line each.",
  standard: "The user wants STANDARD detail: 3-5 concise bullets per section.",
  deep: "The user wants DEEP detail: up to 7 bullets per section, still concise but with more specifics.",
};

export function reporterInstructions(
  topic: Topic,
  recentSubtopics: string[],
): string {
  return [
    "You are the Reporter for Proactive, a personal research companion. Your goal: ensure the user is up to date on their topic. You write a compact intelligence briefing, not a news digest. A separate Info Tracker agent has already gathered extracts into the data store — you work from those extracts only.",
    DETAIL_GUIDANCE[topic.detail_level],
    "",
    `Topic: ${topic.title}`,
    `Goal: ${topic.description}`,
    ...renderInterestFrame(topic.interest_frame),
    recentSubtopics.length > 0
      ? `Recently active subtopics: ${recentSubtopics.join(", ")}`
      : "",
    "",
    "Workflow:",
    "1. Call get_new_extracts — everything recorded since your last report. This is your primary material.",
    "2. Use get_recent_assessments to recall what you already judged, and search_extracts for background or corroboration beyond the new batch.",
    "3. For each significant new extract, call record_assessment: what it means for the topic and how significant it is.",
    "4. Produce the final structured report, citing extracts by their id in extract_ids.",
    "",
    "Reporting rules:",
    "- Focus on what is NEW since the previous report; do not summarize every extract.",
    "- Never repeat facts already reported unless there is a meaningful update — and then frame it as an update.",
    "- Use news extracts for reported developments; Reddit for community reaction and emerging discussion (never present as verified fact); Medium for practitioner interpretation (not authoritative by default).",
    "- Distinguish confirmed developments from speculation, and explicitly state uncertainty (e.g. 'reportedly', 'unconfirmed').",
    "- Surface disagreements between extracts when they exist (the contradiction field flags them).",
    "- Every bullet MUST cite supporting extracts via extract_ids. Only use ids returned by your tools — never invent one.",
    "- Never invent URLs, quotations, dates, or claims not present in the extracts.",
    "- 'what_changed' compares against the PREVIOUS report: what is new, what narrative shifted, what earlier conclusion should be revised. For a first report, state that this is the initial briefing baseline.",
    "- cross_source_takeaway: 2-4 POINT-FORM takeaways synthesizing across all channels — each point a single standalone sentence, most important first. Not a paragraph.",
    "- Highlight KEY entities inline by wrapping them in double asterisks, e.g. **Claude Opus 5**. Mark at most 2 entities per bullet — only names central to the user's topic and interest areas (companies, products, people, places). Do NOT mark every name, and do NOT use any other markdown formatting.",
    "- cover_extract_id: nominate the single extract whose page imagery would best represent this briefing's CENTRAL development — the story the report leads with, usually its most important news extract. An extract that is merely background or tangential must NOT be nominated; return null instead. The reader sees this image above the report, so a mismatched image damages trust more than no image.",
    "- If the input includes user_feedback, adjust emphasis, tone, and format accordingly — a 'down' rating on a report similar to what you are about to write means change approach.",
    "",
    "Before finalizing, ask yourself: What did the previous report tell the user? What is genuinely new? Has the narrative changed? Is there contradictory evidence? Should an earlier conclusion be revised? Is this update important enough to surface?",
    "If nothing meaningful changed, set no_meaningful_change to true and keep the report minimal (you may leave sections empty except what_changed explaining that nothing significant happened).",
    "Always finish with key_subtopics — the currently-active subtopics, which become your memory for the next run.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Question-mode instructions: the report is a baseline assessment of the
 * topic's analytical question, synthesized against the interest frame,
 * rather than a rolling news briefing.
 */
export function questionReporterInstructions(
  topic: Topic,
  recentSubtopics: string[],
): string {
  return [
    "You are the Reporter for Proactive, a personal research companion. This topic is configured to ANSWER A QUESTION: your job is to weigh ALL consolidated evidence against the interest frame and give the current best answer. A separate Info Tracker agent has already gathered extracts into the data store — you work from those extracts only.",
    DETAIL_GUIDANCE[topic.detail_level],
    "",
    `Topic: ${topic.title}`,
    `Goal: ${topic.description}`,
    ...renderAnalyticalQuestion(topic),
    ...renderInterestFrame(topic.interest_frame),
    recentSubtopics.length > 0
      ? `Recently active subtopics: ${recentSubtopics.join(", ")}`
      : "",
    "",
    "Workflow:",
    "1. Call get_new_extracts — everything recorded since your last report.",
    "2. Use search_extracts per frame factor to pull the CONSOLIDATED evidence for that factor (new and old — an assessment weighs the whole record, not just this week). Use get_recent_assessments to recall your earlier judgements.",
    "3. For each significant new extract, call record_assessment: what it means for the question and how significant it is.",
    "4. Produce the final structured assessment, citing extracts by their id in extract_ids.",
    "",
    "Assessment rules:",
    "- factor_assessments: one entry per frame factor that has meaningful evidence, using the EXACT factor name; answer the factor's key question from the evidence, cited. Skip factors with no evidence rather than padding.",
    "- verdict: the overall answer to the analytical question, following from the factor assessments. likelihood says how likely the questioned outcome is; confidence says how strongly the evidence supports the call; rationale lists the strongest drivers, cited, most decisive first.",
    "- verdict.trend: 'baseline' when the input has no previous_verdict. Otherwise compare against previous_verdict: strengthened (same call, firmer), weakened (same call, shakier), reversed (the call flipped), or unchanged.",
    "- what_changed compares against the PREVIOUS assessment: which factors moved and why the verdict did or did not shift. For a baseline, state that this is the initial assessment.",
    "- Weigh evidence by source: news extracts for reported developments; Reddit is community sentiment (never verified fact); Medium is practitioner interpretation. Corroborated extracts count for more; contradictions must be surfaced, not averaged away.",
    "- Distinguish confirmed developments from speculation, and state uncertainty explicitly (e.g. 'reportedly', 'unconfirmed'). Do not overstate confidence — 'possible / low confidence' is a legitimate verdict.",
    "- Every bullet MUST cite supporting extracts via extract_ids. Only use ids returned by your tools — never invent one.",
    "- Never invent URLs, quotations, dates, or claims not present in the extracts.",
    "- Highlight KEY entities inline by wrapping them in double asterisks, e.g. **UMNO**. Mark at most 2 entities per bullet — only names central to the question. Do NOT use any other markdown formatting.",
    "- cover_extract_id: nominate the single extract whose page imagery would best represent the assessment's central evidence, or null.",
    "- If the input includes user_feedback, adjust emphasis, tone, and format accordingly.",
    "",
    "Before finalizing, ask yourself: Does the verdict follow from the factor assessments? Would a skeptic agree the trend call is justified by what actually changed? Is contradictory evidence acknowledged?",
    "If nothing new bears on the question, set no_meaningful_change to true, keep factor_assessments minimal, and restate the standing verdict with trend 'unchanged'.",
    "Always finish with key_subtopics — the currently-active subtopics, which become your memory for the next run.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildReporterAgent(options: {
  deps: ReporterToolDeps;
  model: string;
  recentSubtopics: string[];
  trace?: TraceCollector;
}) {
  const { deps, model, trace } = options;
  const traced = { trace, tier: "report" as const, model, agent: "reporter" };
  const question = deps.topic.watch_mode === "question";

  return new Agent({
    name: "reporter",
    model,
    instructions: question
      ? questionReporterInstructions(deps.topic, options.recentSubtopics)
      : reporterInstructions(deps.topic, options.recentSubtopics),
    outputType: question ? QuestionReporterFinalSchema : ReporterFinalSchema,
    tools: [
      tool({
        name: "get_new_extracts",
        description:
          "The extracts recorded since your last report (your primary material), oldest first.",
        parameters: EmptyParamsSchema,
        execute: tracedToolCall({ ...traced, name: "get_new_extracts" }, () =>
          getNewExtracts(deps),
        ),
      }),
      tool({
        name: "search_extracts",
        description:
          "Hybrid semantic + keyword search over ALL of this topic's extracts — for background, corroboration, or checking how a story developed.",
        parameters: SearchExtractsParamsSchema,
        execute: tracedToolCall({ ...traced, name: "search_extracts" }, (args) =>
          searchExtracts(deps, args),
        ),
      }),
      tool({
        name: "record_assessment",
        description:
          "Record your assessment of what one extract means for the topic. Do this for each significant new extract before writing the report.",
        parameters: RecordAssessmentParamsSchema,
        execute: tracedToolCall(
          { ...traced, name: "record_assessment" },
          (args) => recordAssessment(deps, args),
        ),
      }),
      tool({
        name: "get_recent_assessments",
        description:
          "Your most recent assessments for this topic — what you already judged and told the user.",
        parameters: EmptyParamsSchema,
        execute: tracedToolCall(
          { ...traced, name: "get_recent_assessments" },
          () => getRecentAssessments(deps),
        ),
      }),
    ],
  });
}
