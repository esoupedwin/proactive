import { run } from "@openai/agents";
import type { TraceCollector } from "../../ai/trace";
import type { UsageCollector } from "../../ai/usage";
import type { Topic } from "../../types";
import { initAgentsSdk, trackerModel } from "../client";
import type { ExaSearcher } from "../exa";
import type { ExtractStore } from "../extract-store";
import type { TrackerFinal } from "../schemas";
import { recordAgentRun, type AgentModelResponse } from "../usage-adapter";
import { buildTrackerAgent, type TrackerCounters } from "./agent";

export interface TrackerRunResult {
  ok: boolean;
  newExtracts: number;
  mergedExtracts: number;
  keySubtopics: string[];
  error?: string;
}

const DEFAULT_MAX_TURNS = 12;

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
}): Promise<TrackerRunResult> {
  const { store, exa, topic, usage, trace } = options;
  const counters: TrackerCounters = { created: 0, merged: 0 };
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const model = trackerModel();

  try {
    initAgentsSdk();
    const state = await store.getAgentState(topic.id, "tracker");
    const recentSubtopics = state.recent_subtopics ?? [];

    const agent = buildTrackerAgent({
      deps: { store, exa, topic },
      model,
      recentSubtopics,
      counters,
      trace,
    });

    const input = `Find and record what is new for this topic. Today is ${startedAt}.`;
    const result = await run(agent, input, {
      maxTurns: options.maxTurns ?? DEFAULT_MAX_TURNS,
    });

    recordAgentRun({
      responses: result.rawResponses as unknown as AgentModelResponse[],
      usage,
      trace,
      tier: "search",
      model,
      agentName: "info-tracker",
      instructions: agent.instructions as string,
      input,
      startedAt,
      durationMs: Date.now() - startMs,
    });

    const final = result.finalOutput as TrackerFinal | undefined;
    const keySubtopics = final?.key_subtopics ?? recentSubtopics;

    await store.saveAgentState(topic, "tracker", {
      ...state,
      recent_subtopics: keySubtopics,
      last_run_at: new Date().toISOString(),
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
    return {
      ok: false,
      newExtracts: counters.created,
      mergedExtracts: counters.merged,
      keySubtopics: [],
      error: message,
    };
  }
}
