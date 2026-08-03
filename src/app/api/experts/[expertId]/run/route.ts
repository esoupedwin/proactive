import { NextResponse } from "next/server";
import { runExpertOnReport } from "@/lib/ai/experts/runner";
import { createOpenAiLlm } from "@/lib/ai/openai";
import { foldUsageIntoReport } from "@/lib/ai/report-usage";
import { createUsageCollector } from "@/lib/ai/usage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Expert, Topic } from "@/lib/types";

export const maxDuration = 120;

/** POST /api/experts/[expertId]/run — run an expert on a specific report. */
export async function POST(
  request: Request,
  context: { params: Promise<{ expertId: string }> },
) {
  const { expertId } = await context.params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { reportId?: string }
    | null;
  if (!body?.reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }

  // RLS scopes both lookups to the caller's own rows.
  const { data: expert } = await supabase
    .from("experts")
    .select("*")
    .eq("id", expertId)
    .maybeSingle<Expert>();
  if (!expert) {
    return NextResponse.json({ error: "Expert not found" }, { status: 404 });
  }

  const { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("id", expert.topic_id)
    .maybeSingle<Topic>();
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  try {
    const usage = createUsageCollector();
    const output = await runExpertOnReport({
      supabase,
      llm: createOpenAiLlm(usage),
      expert,
      topic,
      reportId: body.reportId,
      usage,
    });
    if (!output) {
      return NextResponse.json(
        { error: "The expert produced no output for this report." },
        { status: 422 },
      );
    }
    // This run used its own collector, so the cost isn't in reports.usage yet.
    await foldUsageIntoReport(supabase, body.reportId, usage.snapshot());
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Expert run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
