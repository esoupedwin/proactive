import { NextResponse } from "next/server";
import { createOpenAiEmbedder } from "@/lib/agents/embeddings";
import { createExaSearcher } from "@/lib/agents/exa";
import { createSupabaseExtractStore } from "@/lib/agents/extract-store";
import { createSupabaseReporterPersistence } from "@/lib/agents/report-store";
import { runReporter } from "@/lib/agents/reporter/run";
import { runInfoTracker } from "@/lib/agents/tracker/run";
import { createOpenAiLlm } from "@/lib/ai/openai";
import { runActiveExpertsForReport } from "@/lib/ai/experts/runner";
import { createTraceCollector } from "@/lib/ai/trace";
import { createUsageCollector } from "@/lib/ai/usage";
import { isGenerationLocked } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Report, Topic } from "@/lib/types";

// The two agent runs make several model + tool calls.
export const maxDuration = 300;

// Run the tracker inline only when its last run is older than this — an
// on-demand generate is the user asking "what's new NOW", but repeat clicks
// shouldn't re-search the web every time.
const TRACKER_STALE_MINUTES = 60;
// Inline tracker is tighter than the scheduled one to protect the reporter's
// share of the 300s budget.
const INLINE_TRACKER_MAX_TURNS = 8;

/** POST /api/topics/[topicId]/generate — manually trigger a new update. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await context.params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // RLS scopes this to the caller's own topics.
  const { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("id", topicId)
    .maybeSingle<Topic>();
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  // Concurrency guard: refuse if a recent generation is still running.
  const { data: latestGenerating } = await supabase
    .from("reports")
    .select("status, created_at")
    .eq("topic_id", topicId)
    .eq("status", "generating")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<Report, "status" | "created_at">>();

  if (isGenerationLocked(latestGenerating)) {
    return NextResponse.json(
      { error: "An update is already being generated for this topic." },
      { status: 409 },
    );
  }

  const { data: report, error: insertError } = await supabase
    .from("reports")
    .insert({ topic_id: topic.id, user_id: user.id, status: "generating" })
    .select("id")
    .single<{ id: string }>();
  if (insertError || !report) {
    return NextResponse.json(
      { error: "Could not start report generation." },
      { status: 500 },
    );
  }

  const usage = createUsageCollector();
  const trace = createTraceCollector();
  const store = createSupabaseExtractStore(
    supabase,
    createOpenAiEmbedder(usage),
  );
  const persistence = createSupabaseReporterPersistence(supabase);

  // Freshness: run the Info Tracker inline when it hasn't run recently.
  // Failure is non-fatal — extracts from previous cycles still exist.
  try {
    const trackerState = await store.getAgentState(topic.id, "tracker");
    const lastRun = trackerState.last_run_at
      ? Date.parse(trackerState.last_run_at)
      : 0;
    if (Date.now() - lastRun > TRACKER_STALE_MINUTES * 60_000) {
      await persistence
        .setStage?.(report.id, "Scanning for new developments")
        .catch(() => {});
      await runInfoTracker({
        store,
        exa: createExaSearcher(),
        topic,
        usage,
        trace,
        maxTurns: INLINE_TRACKER_MAX_TURNS,
      });
    }
  } catch (err) {
    console.error("inline tracker failed", err);
  }

  const result = await runReporter({
    persistence,
    store,
    topic,
    reportId: report.id,
    llm: createOpenAiLlm(usage, trace),
    usage,
    trace,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Report generation failed." },
      { status: 500 },
    );
  }

  // Experts (e.g. Mentor) read the finished report; their calls share the
  // usage/trace collectors, so refresh the stored snapshots afterwards.
  try {
    const ran = await runActiveExpertsForReport({
      supabase,
      llm: createOpenAiLlm(usage, trace),
      topic,
      reportId: report.id,
      usage,
    });
    if (ran > 0) {
      await supabase
        .from("reports")
        .update({ usage: usage.snapshot(), trace: trace.snapshot() })
        .eq("id", report.id);
    }
  } catch (err) {
    console.error("experts run failed", err);
  }

  return NextResponse.json({
    ok: true,
    reportId: report.id,
    usage: usage.snapshot(),
  });
}
