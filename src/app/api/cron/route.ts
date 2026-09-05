import { NextResponse } from "next/server";
import { createOpenAiEmbedder } from "@/lib/agents/embeddings";
import { createSupabaseExtractStore } from "@/lib/agents/extract-store";
import { createSupabaseReporterPersistence } from "@/lib/agents/report-store";
import { runReporter } from "@/lib/agents/reporter/run";
import { flushLedger } from "@/lib/ai/ledger";
import { createOpenAiLlm } from "@/lib/ai/openai";
import { runActiveExpertsForReport } from "@/lib/ai/experts/runner";
import { createTraceCollector } from "@/lib/ai/trace";
import { createUsageCollector } from "@/lib/ai/usage";
import { isGenerationLocked, isTopicDue } from "@/lib/reports";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Report, Topic } from "@/lib/types";

export const maxDuration = 300;

// Bound work per cron invocation to stay within function limits.
const MAX_TOPICS_PER_RUN = 5;

/**
 * GET /api/cron — scheduled Reporter runs (see vercel.json).
 * The Info Tracker runs on its own pg_cron schedule (/api/cron/tracker);
 * this route only turns accumulated extracts into reports.
 * Authenticated with `Authorization: Bearer ${CRON_SECRET}`, which Vercel
 * sends automatically when the CRON_SECRET env var is set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: activeTopics, error } = await supabase
    .from("topics")
    .select("*")
    .eq("status", "active")
    .neq("frequency", "manual")
    .order("last_generated_at", { ascending: true, nullsFirst: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = ((activeTopics ?? []) as Topic[])
    .filter((t) => isTopicDue(t))
    .slice(0, MAX_TOPICS_PER_RUN);

  const results: Array<{ topicId: string; ok: boolean; error?: string }> = [];

  for (const topic of due) {
    const { data: latestGenerating } = await supabase
      .from("reports")
      .select("status, created_at")
      .eq("topic_id", topic.id)
      .eq("status", "generating")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Pick<Report, "status" | "created_at">>();
    if (isGenerationLocked(latestGenerating)) {
      results.push({ topicId: topic.id, ok: false, error: "locked" });
      continue;
    }

    const { data: report } = await supabase
      .from("reports")
      .insert({ topic_id: topic.id, user_id: topic.user_id, status: "generating" })
      .select("id")
      .single<{ id: string }>();
    if (!report) {
      results.push({ topicId: topic.id, ok: false, error: "insert failed" });
      continue;
    }

    const usage = createUsageCollector();
    const trace = createTraceCollector();
    const result = await runReporter({
      persistence: createSupabaseReporterPersistence(supabase),
      store: createSupabaseExtractStore(supabase, createOpenAiEmbedder(usage)),
      topic,
      reportId: report.id,
      llm: createOpenAiLlm(usage, trace),
      usage,
      trace,
    });

    if (result.ok) {
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
    }

    await flushLedger(supabase, usage, {
      userId: topic.user_id,
      topicId: topic.id,
      reportId: report.id,
    });

    results.push({ topicId: topic.id, ok: result.ok, error: result.error });
  }

  return NextResponse.json({
    checked: activeTopics?.length ?? 0,
    generated: results.filter((r) => r.ok).length,
    results,
  });
}
