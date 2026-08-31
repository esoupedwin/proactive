import { NextResponse } from "next/server";
import {
  EXPLAIN_CONTEXT_MAX,
  EXPLAIN_SELECTION_MAX,
  explainSelection,
} from "@/lib/ai/explain";
import { openAiLlm } from "@/lib/ai/openai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Topic } from "@/lib/types";

export const maxDuration = 60;

/** POST /api/topics/[topicId]/explain — "Tell me more" on a highlighted passage. */
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

  const body = (await request.json().catch(() => null)) as
    | { text?: string; context?: string }
    | null;
  const text = body?.text?.trim() ?? "";
  if (text.length < 2) {
    return NextResponse.json(
      { error: "Highlight something to explain." },
      { status: 400 },
    );
  }

  // RLS: only the owner's topic resolves.
  const { data: topic } = await supabase
    .from("topics")
    .select("title, description")
    .eq("id", topicId)
    .maybeSingle<Pick<Topic, "title" | "description">>();
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  try {
    const selection = text.slice(0, EXPLAIN_SELECTION_MAX);
    const context = (body?.context ?? "").slice(0, EXPLAIN_CONTEXT_MAX);
    const { explanation } = await explainSelection(
      openAiLlm,
      topic,
      selection,
      context,
    );

    // History (Settings → Tell me more) — best-effort: a failed insert must
    // never eat an answer that was already generated and paid for.
    const { error: saveError } = await supabase.from("explanations").insert({
      topic_id: topicId,
      user_id: user.id,
      selection,
      context: context || null,
      explanation,
    });
    if (saveError) {
      console.error("saving explanation failed", saveError.message);
    }

    return NextResponse.json({ ok: true, explanation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Explanation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
