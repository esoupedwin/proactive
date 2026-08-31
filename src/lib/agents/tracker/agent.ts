import { Agent, tool, webSearchTool } from "@openai/agents";
import { maxExtractsPerRun, trackerInstructions } from "../../prompts";
import type { TraceCollector } from "../../ai/trace";
import {
  CorroborateExtractParamsSchema,
  ExaSearchParamsSchema,
  RecordExtractParamsSchema,
  SearchExtractsParamsSchema,
  TrackerFinalSchema,
} from "../schemas";
import { tracedToolCall } from "../usage-adapter";
import {
  corroborateExtract,
  exaSearch,
  recordExtract,
  searchExistingExtracts,
  type TrackerToolDeps,
} from "./tools";

// The instruction text lives in lib/prompts.ts (the app-wide prompt catalog);
// re-exported here so existing importers and tests keep their path.
export { maxExtractsPerRun, trackerInstructions };

/** Mutable counters shared with run.ts — ground truth for what was recorded. */
export interface TrackerCounters {
  created: number;
  merged: number;
}

export function buildTrackerAgent(options: {
  deps: TrackerToolDeps;
  model: string;
  recentSubtopics: string[];
  counters: TrackerCounters;
  trace?: TraceCollector;
}) {
  const { deps, model, counters, trace } = options;
  const traced = {
    trace,
    tier: "search" as const,
    model,
    agent: "info-tracker",
  };

  return new Agent({
    name: "info-tracker",
    model,
    instructions: trackerInstructions(deps.topic, options.recentSubtopics),
    outputType: TrackerFinalSchema,
    // Ask the Responses API to report which URLs each hosted search consulted,
    // so the activity view can show results and not just the query. providerData
    // is passed straight through to the request; the SDK contributes nothing to
    // `include` for web search, so setting it here clobbers nothing.
    modelSettings: {
      providerData: { include: ["web_search_call.action.sources"] },
    },
    tools: [
      webSearchTool(),
      tool({
        name: "exa_search",
        description:
          "Semantic web search (Exa). Describe the content you want in natural language; finds discussions, blogs, and analysis that keyword search misses.",
        parameters: ExaSearchParamsSchema,
        execute: tracedToolCall({ ...traced, name: "exa_search" }, (args) =>
          exaSearch(deps, args),
        ),
      }),
      tool({
        name: "search_existing_extracts",
        description:
          "Search the extracts already recorded for this topic (semantic + keyword). Use before recording to avoid duplicates.",
        parameters: SearchExtractsParamsSchema,
        execute: tracedToolCall(
          { ...traced, name: "search_existing_extracts" },
          (args) => searchExistingExtracts(deps, args),
        ),
      }),
      tool({
        name: "record_extract",
        description:
          "Record one new development or discussion as an extract. Returns whether it was created or merged into an existing extract for the same url.",
        parameters: RecordExtractParamsSchema,
        execute: tracedToolCall(
          { ...traced, name: "record_extract" },
          async (args) => {
            const result = await recordExtract(deps, args);
            if (result.outcome === "created") counters.created += 1;
            else counters.merged += 1;
            return JSON.stringify(result);
          },
        ),
      }),
      tool({
        name: "corroborate_extract",
        description:
          "Mark an existing extract as corroborated by another outlet reporting the same story.",
        parameters: CorroborateExtractParamsSchema,
        execute: tracedToolCall(
          { ...traced, name: "corroborate_extract" },
          (args) => corroborateExtract(deps, args),
        ),
      }),
    ],
  });
}
