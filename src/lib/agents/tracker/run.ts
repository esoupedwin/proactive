import { Runner, type ModelProvider } from "@openai/agents";
import type { TraceCollector } from "../../ai/trace";
import type { UsageCollector } from "../../ai/usage";
import type { AgentStateData, Topic } from "../../types";
import {
  createOpenAiModelProvider,
  initAgentsSdk,
  trackerModel,
} from "../client";
import type { ExaSearcher } from "../exa";
import type { ExtractStore } from "../extract-store";
import type { TrackerFinal } from "../schemas";
import { createTracingModelProvider } from "../usage-adapter";
import { buildTrackerAgent, type TrackerCounters } from "./agent";

export interface TrackerRunResult {
  ok: boolean;
  newExtracts: number;
  mergedExtracts: number;
  keySubtopics: string[];
  error?: string;
}

/**
 * Turn budget for one run, sized to the work the plan actually implies: about
 * one turn to issue the planned web searches, two per extract recorded (check
 * the store, then write it), and one to close with the summary.
 *
 * It has to scale with the factor count, because the search plan does. A flat
 * budget bought the same few extracts however many factors were configured —
 * at 8 turns a six-factor topic recorded three and was cut off mid-harvest,
 * so adding factors made truncation more likely rather than coverage better.
 *
 * Still capped: every caller shares a 300s function limit with whatever runs
 * after it (the Reporter inline, the next topic on the schedule). The cap
 * lands below the full extract budget by design — a partial harvest is the
 * price of not blowing the deadline, and what is recorded is already stored.
 */
export function trackerMaxTurns(factorCount: number): number {
  return Math.min(20, 2 * Math.max(1, factorCount) + 6);
}

/**
 * One Info Tracker run for one topic: agentic search → record extracts →
 * persist "recent key subtopics" memory. Never throws — a tracker failure
 * must not break callers (there is no report row to fail).
 */
export async function runInfoTracker(options: {
  store: ExtractStore;
  exa: ExaSearcher;
  topic: Topic;
  usage?: UsageCollector;
  trace?: TraceCollector;
  maxTurns?: number;
  /** Test seam — real runs default to the OpenAI provider. */
  modelProvider?: ModelProvider;
}): Promise<TrackerRunResult> {
  const { store, exa, topic, usage, trace } = options;
  const counters: TrackerCounters = { created: 0, merged: 0 };
  const startedAt = new Date().toISOString();
  const model = trackerModel();
  // Hoisted so the catch below can still write state back — a run that ends
  // early has usually recorded extracts already, and that has to be visible.
  let state: AgentStateData = {};
  const maxTurns =
    options.maxTurns ?? trackerMaxTurns(searchedFactorCount(topic));

  try {
    initAgentsSdk();
    state = await store.getAgentState(topic.id, "tracker");
    const recentSubtopics = state.recent_subtopics ?? [];

    const agent = buildTrackerAgent({
      deps: { store, exa, topic },
      model,
      recentSubtopics,
      counters,
      trace,
    });

    const input = `Find and record what is new for this topic. Today is ${startedAt}.`;
    // Model turns are traced live (usage-adapter), so the trace reads in
    // true chronological order: turn → its web searches → tool calls.
    const runner = new Runner({
      modelProvider: createTracingModelProvider({
        inner: options.modelProvider ?? createOpenAiModelProvider(),
        usage,
        trace,
        tier: "search",
        model,
        agentName: "info-tracker",
        instructions: agent.instructions as string,
        input,
      }),
    });
    const result = await runner.run(agent, input, { maxTurns });

    const final = result.finalOutput as TrackerFinal | undefined;
    const keySubtopics = final?.key_subtopics ?? recentSubtopics;

    await store.saveAgentState(topic, "tracker", {
      ...state,
      recent_subtopics: keySubtopics,
      last_run_at: new Date().toISOString(),
      // This run finished, so clear any truncation left by the last one.
      last_run_truncated: false,
      last_run_error: null,
    });

    return {
      ok: true,
      newExtracts: counters.created,
      mergedExtracts: counters.merged,
      keySubtopics,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "tracker run failed";
    console.error("info tracker failed", topic.id, err);
    // The abort happens in the runner, between calls, so it leaves no trace
    // entry of its own — without this the activity page shows a tidy list of
    // turns and no sign the agent was stopped mid-harvest.
    trace?.note({ agent: "info-tracker", error: message, max_turns: maxTurns });
    // Extracts are written as they are found, so a run that ends early still
    // leaves a partial harvest behind. Record that, so the briefing can say
    // the scan was incomplete instead of presenting it as a full sweep.
    //
    // `last_run_at` is deliberately NOT stamped: an unfinished run should
    // still count as due, so the next generate re-scans rather than skipping
    // on the staleness check.
    await store
      .saveAgentState(topic, "tracker", {
        ...state,
        last_run_truncated: true,
        last_run_error: message,
      })
      .catch(() => {
        // Best-effort — the run already failed; losing the note is not worth
        // turning a handled failure into a thrown one.
      });
    return {
      ok: false,
      newExtracts: counters.created,
      mergedExtracts: counters.merged,
      keySubtopics: [],
      error: message,
    };
  }
}

/** Factors the search plan will actually search — blank names are skipped. */
function searchedFactorCount(topic: Topic): number {
  return topic.interest_frame.filter((f) => f.name.trim() !== "").length;
}
