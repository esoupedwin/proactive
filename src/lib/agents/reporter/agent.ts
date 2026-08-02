import { Agent, tool } from "@openai/agents";
import type { TraceCollector } from "../../ai/trace";
import type { DetailLevel, Topic } from "../../types";
import {
  EmptyParamsSchema,
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
    `Interest areas: ${topic.interest_areas.join(", ")}`,
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

export function buildReporterAgent(options: {
  deps: ReporterToolDeps;
  model: string;
  recentSubtopics: string[];
  trace?: TraceCollector;
}) {
  const { deps, model, trace } = options;
  const traced = { trace, tier: "report" as const, model, agent: "reporter" };

  return new Agent({
    name: "reporter",
    model,
    instructions: reporterInstructions(deps.topic, options.recentSubtopics),
    outputType: ReporterFinalSchema,
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
