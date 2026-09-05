import { Agent, tool } from "@openai/agents";
import {
  questionReporterInstructions,
  reporterInstructions,
  trendingReporterInstructions,
} from "../../prompts";
import type { TraceCollector } from "../../ai/trace";
import type { KnowledgeFact } from "../../types";
import {
  EmptyParamsSchema,
  QuestionReporterFinalSchema,
  RecordAssessmentParamsSchema,
  ReporterFinalSchema,
  SearchExtractsParamsSchema,
  TrendingReporterFinalSchema,
} from "../schemas";
import { tracedToolCall } from "../usage-adapter";
import {
  getNewExtracts,
  getRecentAssessments,
  recordAssessment,
  searchExtracts,
  type ReporterToolDeps,
} from "./tools";

// The instruction text lives in lib/prompts.ts (the app-wide prompt catalog);
// re-exported here so existing importers and tests keep their path.
export {
  questionReporterInstructions,
  reporterInstructions,
  trendingReporterInstructions,
};

export function buildReporterAgent(options: {
  deps: ReporterToolDeps;
  model: string;
  recentSubtopics: string[];
  /** Question mode: the standing facts the assessment rests on. */
  situation?: KnowledgeFact[];
  trace?: TraceCollector;
}) {
  const { deps, model, trace } = options;
  const traced = { trace, tier: "report" as const, model, agent: "reporter" };
  const mode = deps.topic.watch_mode;

  return new Agent({
    name: "reporter",
    model,
    // Same cache setup as the tracker (see its comment): 24h retention makes
    // the cache actually write, and the per-topic key keeps every turn of a
    // run on the same cache shard, so resent prefixes bill at the cached rate.
    modelSettings: {
      promptCacheRetention: "24h",
      providerData: { prompt_cache_key: `topic-${deps.topic.id}` },
    },
    instructions:
      mode === "question"
        ? questionReporterInstructions(
            deps.topic,
            options.recentSubtopics,
            options.situation,
          )
        : mode === "trending"
          ? trendingReporterInstructions(deps.topic, options.recentSubtopics)
          : reporterInstructions(deps.topic, options.recentSubtopics),
    outputType:
      mode === "question"
        ? QuestionReporterFinalSchema
        : mode === "trending"
          ? TrendingReporterFinalSchema
          : ReporterFinalSchema,
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
