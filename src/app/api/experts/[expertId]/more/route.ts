import { NextResponse } from "next/server";
import { expandMentorTip } from "@/lib/ai/experts/mentor";
import { openAiLlm } from "@/lib/ai/openai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Expert, ExpertOutput, Topic } from "@/lib/types";

export const maxDuration = 60;

/** POST /api/experts/[expertId]/more — deeper explanation for one Mentor tip. */
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
    | { outputId?: string; tipId?: string }
    | null;
  if (!body?.outputId || !body?.tipId) {
    return NextResponse.json(
      { error: "outputId and tipId are required" },
      { status: 400 },
    );
  }

  const [{ data: expert }, { data: output }] = await Promise.all([
    supabase
      .from("experts")
      .select("*")
      .eq("id", expertId)
      .maybeSingle<Expert>(),
    supabase
      .from("expert_outputs")
      .select("*")
      .eq("id", body.outputId)
      .eq("expert_id", expertId)
      .maybeSingle<ExpertOutput>(),
  ]);
  if (!expert || !output) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tip = output.output.tips.find((t) => t.id === body.tipId);
  if (!tip) {
    return NextResponse.json({ error: "Tip not found" }, { status: 404 });
  }
  if (tip.more) {
    return NextResponse.json({ ok: true, more: tip.more });
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
    const more = await expandMentorTip(
      openAiLlm,
      topic,
      expert.config.level ?? "basic",
      tip.concept,
      tip.tip,
    );

    const tips = output.output.tips.map((t) =>
      t.id === tip.id ? { ...t, more } : t,
    );
    await supabase
      .from("expert_outputs")
      .update({ output: { tips } })
      .eq("id", output.id);

    return NextResponse.json({ ok: true, more });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Expansion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
