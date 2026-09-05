import { NextResponse } from "next/server";
import {
  SUMMARY_MAX_EXTRACTS,
  SUMMARY_WINDOW_DAYS,
  summaryInstructions,
  summaryPayload,
  summaryWindowStart,
} from "@/lib/ai/extracts-summary";
import { flushLedger } from "@/lib/ai/ledger";
import {
  openRouterComplete,
  openRouterConfigured,
  summaryModel,
} from "@/lib/ai/openrouter";
import { createUsageCollector } from "@/lib/ai/usage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { frameFactorNames } from "@/lib/types";
import type { ExtractRecord, Topic } from "@/lib/types";

export const maxDuration = 60;

/**
 * POST /api/topics/[topicId]/extracts/summary — digest of the extracts
 * recorded in the last few days, honouring the page's factor filter. Runs on
 * a cheap OpenRouter model (OPENROUTER_SUMMARY_MODEL); the OpenAI agents are
 * untouched.
 */
export async function POST(
  request: Request,
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

  if (!openRouterConfigured()) {
    return NextResponse.json(
      { error: "OpenRouter is not configured — set OPENROUTER_API_KEY." },
      { status: 503 },
    );
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

  const body = (await request.json().catch(() => null)) as {
    factor?: string;
  } | null;
  // Same vocabulary as the extracts page: a frame factor name, "unfiled"
  // for the null bucket, or nothing for all extracts.
  const factors = frameFactorNames(topic.interest_frame ?? []);
  const raw = body?.factor?.trim() ?? "";
  const factor =
    raw && (factors.includes(raw) || raw === "unfiled") ? raw : "";

  let query = supabase
    .from("extracts")
    .select(
      "source_type, title, published_at, factor, gist, contradiction, corroborations, created_at",
    )
    .eq("topic_id", topicId)
    .gte("created_at", summaryWindowStart())
    .order("created_at", { ascending: false })
    .limit(SUMMARY_MAX_EXTRACTS);
  if (factor === "unfiled") query = query.is("factor", null);
  else if (factor) query = query.eq("factor", factor);
  const { data } = await query;
  const extracts = (data ?? []) as ExtractRecord[];

  if (extracts.length === 0) {
    return NextResponse.json({
      summary: null,
      extractCount: 0,
      days: SUMMARY_WINDOW_DAYS,
    });
  }

  const usage = createUsageCollector();
  try {
    const summary = await openRouterComplete({
      model: summaryModel(),
      instructions: summaryInstructions(topic, factor || null),
      input: summaryPayload(extracts),
      // Summarization needs no thinking phase — reasoning off is ~30%
      // cheaper here and cannot eat the output budget before the digest.
      enableReasoning: false,
      usage,
      activity: "extracts_summary",
    });
    return NextResponse.json({
      summary,
      extractCount: extracts.length,
      days: SUMMARY_WINDOW_DAYS,
      model: summaryModel(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Summary failed";
    console.error("extracts summary failed", err);
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    // Ledger in finally: a failed call may still have consumed tokens, and
    // accounting must never block or break the response either way.
    await flushLedger(supabase, usage, { userId: user.id, topicId });
  }
}
