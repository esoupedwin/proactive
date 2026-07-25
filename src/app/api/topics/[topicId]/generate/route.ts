import { NextResponse } from "next/server";
import { createOpenAiLlm } from "@/lib/ai/openai";
import {
  createSupabaseReportStore,
  runReportPipeline,
} from "@/lib/ai/pipeline";
import { createUsageCollector } from "@/lib/ai/usage";
import { isGenerationLocked } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Report, Topic } from "@/lib/types";

// Report generation makes several model + web-search calls.
export const maxDuration = 300;

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
  const result = await runReportPipeline({
    llm: createOpenAiLlm(usage),
    store: createSupabaseReportStore(supabase),
    topic,
    reportId: report.id,
    usage,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Report generation failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    reportId: report.id,
    usage: usage.snapshot(),
  });
}
