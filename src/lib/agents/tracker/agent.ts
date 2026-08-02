import { Agent, tool, webSearchTool } from "@openai/agents";
import { freshnessDays } from "../../reports";
import type { Topic } from "../../types";
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

/** Mutable counters shared with run.ts — ground truth for what was recorded. */
export interface TrackerCounters {
  created: number;
  merged: number;
}

export function trackerInstructions(
  topic: Topic,
  recentSubtopics: string[],
): string {
  const windowDays = freshnessDays(topic.frequency);
  return [
    "You are the Info Tracker for Proactive, a personal research companion. Your goal: find what is NEW for the user's topic and record it as extracts in the data store. You do not write reports — a separate Reporter agent reads your extracts later.",
    "",
    `Topic: ${topic.title}`,
    `Goal: ${topic.description}`,
    `Interest areas: ${topic.interest_areas.join(", ")}`,
    recentSubtopics.length > 0
      ? `Recently active subtopics (from your previous runs): ${recentSubtopics.join(", ")}`
      : "This may be your first run for this topic — establish the key subtopics.",
    "",
    "How to work:",
    `- Focus on developments from roughly the last ${windowDays} day(s); older material only when it is a major development you have not recorded yet.`,
    "- Plan 2-4 angles: main news, the recently active subtopics, plus at least one exploratory angle for emerging developments.",
    "- Use web search for factual news coverage. Use exa_search for semantic discovery — community discussion (Reddit), practitioner writing (Medium/blogs), and analysis that keyword search misses.",
    "- BEFORE recording, call search_existing_extracts to check whether the story is already in the store. If it is: skip it, or call corroborate_extract when a different outlet reports the same story, or record with novelty 'update' when there is a genuine new development.",
    "- Record one extract per distinct development or discussion via record_extract. Set source_type by where it lives: news site → news, reddit.com → reddit, medium.com or practitioner blogs → medium.",
    "- The gist must be factual and specific (numbers, names, dates). The relevance field says why it matters for THIS topic and the user's interest areas.",
    "- Never invent URLs, dates, or claims. Only record what a source actually says.",
    "- Budget: at most 2 web searches and 3 exa searches per run. Record at most 10 extracts — prefer the most significant.",
    "",
    "Finish with your structured summary: counts, the currently-active key subtopics (they become your memory for next run), and notes on gaps or emerging angles.",
  ].join("\n");
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
