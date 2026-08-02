import { NextResponse } from "next/server";
import { createOpenAiEmbedder } from "@/lib/agents/embeddings";
import { createExaSearcher } from "@/lib/agents/exa";
import { createSupabaseExtractStore } from "@/lib/agents/extract-store";
import { runInfoTracker } from "@/lib/agents/tracker/run";
import { createUsageCollector } from "@/lib/ai/usage";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { AgentStateData, Topic } from "@/lib/types";

export const maxDuration = 300;

// Bound work per invocation; the pg_cron cadence covers the rest.
const MAX_TOPICS_PER_RUN = 4;
// Stop starting new topics near the function limit.
const SOFT_DEADLINE_MS = 240_000;

/**
 * GET /api/cron/tracker — scheduled Info Tracker runs, triggered by Supabase
 * pg_cron + pg_net (see supabase/migrations/0011_tracker_cron.sql).
 * Authenticated with `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Tracking is decoupled from reporting: ALL active topics are tracked
 * (including manual-frequency ones), least-recently-tracked first.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();
  const supabase = createSupabaseAdminClient();

  const { data: activeTopics, error } = await supabase
    .from("topics")
    .select("*")
    .eq("status", "active");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const topics = (activeTopics ?? []) as Topic[];
  if (topics.length === 0) {
    return NextResponse.json({ checked: 0, tracked: 0, results: [] });
  }

  // Least-recently-tracked first (never-tracked topics lead).
  const { data: states } = await supabase
    .from("agent_state")
    .select("topic_id, state")
    .eq("agent", "tracker")
    .in(
      "topic_id",
      topics.map((t) => t.id),
    );
  const lastRunAt = new Map(
    ((states as { topic_id: string; state: AgentStateData }[]) ?? []).map(
      (s) => [s.topic_id, s.state?.last_run_at ?? ""],
    ),
  );
  const queue = [...topics]
    .sort((a, b) =>
      (lastRunAt.get(a.id) ?? "").localeCompare(lastRunAt.get(b.id) ?? ""),
    )
    .slice(0, MAX_TOPICS_PER_RUN);

  const exa = createExaSearcher();
  const results: Array<{
    topicId: string;
    ok: boolean;
    newExtracts?: number;
    error?: string;
  }> = [];

  for (const topic of queue) {
    if (Date.now() - startMs > SOFT_DEADLINE_MS) {
      results.push({ topicId: topic.id, ok: false, error: "deadline" });
      continue;
    }
    // Fresh collector per topic; tracker runs have no report row to persist
    // usage to (v1) — log it for observability instead.
    const usage = createUsageCollector();
    const store = createSupabaseExtractStore(
      supabase,
      createOpenAiEmbedder(usage),
    );
    const result = await runInfoTracker({ store, exa, topic, usage });
    console.log(
      `tracker ${topic.id} (${topic.title}): ok=${result.ok} new=${result.newExtracts} merged=${result.mergedExtracts}`,
      JSON.stringify(usage.snapshot()),
    );
    results.push({
      topicId: topic.id,
      ok: result.ok,
      newExtracts: result.newExtracts,
      error: result.error,
    });
  }

  return NextResponse.json({
    checked: topics.length,
    tracked: results.filter((r) => r.ok).length,
    results,
  });
}
