import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Expert,
  ExpertOutput,
  MentorMemoryData,
  ReportSections,
  Topic,
} from "../../types";
import type { Llm } from "../llm";
import { runMentor } from "./mentor";

/**
 * Runs an expert against one report and persists its output + memory.
 * Dispatches on expert.kind — new expert kinds plug in here.
 */
export async function runExpertOnReport(options: {
  supabase: SupabaseClient;
  llm: Llm;
  expert: Expert;
  topic: Topic;
  reportId: string;
}): Promise<ExpertOutput | null> {
  const { supabase, llm, expert, topic, reportId } = options;

  const { data: report } = await supabase
    .from("reports")
    .select("sections")
    .eq("id", reportId)
    .maybeSingle<{ sections: ReportSections | null }>();
  if (!report?.sections) return null;

  if (expert.kind !== "mentor") return null;

  const { data: memoryRow } = await supabase
    .from("expert_memory")
    .select("memory")
    .eq("expert_id", expert.id)
    .maybeSingle<{ memory: MentorMemoryData }>();
  const memory: MentorMemoryData = memoryRow?.memory ?? { taught: [] };

  const { tips, memory: newMemory } = await runMentor(
    llm,
    topic,
    report.sections,
    expert.config.level ?? "basic",
    memory,
  );

  const { data: outputRow, error } = await supabase
    .from("expert_outputs")
    .upsert(
      {
        expert_id: expert.id,
        report_id: reportId,
        topic_id: topic.id,
        user_id: expert.user_id,
        kind: expert.kind,
        output: { tips },
      },
      { onConflict: "expert_id,report_id" },
    )
    .select("*")
    .single<ExpertOutput>();
  if (error) throw new Error(`saving expert output failed: ${error.message}`);

  await supabase.from("expert_memory").upsert({
    expert_id: expert.id,
    user_id: expert.user_id,
    memory: newMemory,
    updated_at: new Date().toISOString(),
  });

  return outputRow;
}

/** Runs every active expert attached to a topic; one failure never blocks the rest. */
export async function runActiveExpertsForReport(options: {
  supabase: SupabaseClient;
  llm: Llm;
  topic: Topic;
  reportId: string;
}): Promise<number> {
  const { supabase, llm, topic, reportId } = options;

  const { data } = await supabase
    .from("experts")
    .select("*")
    .eq("topic_id", topic.id)
    .eq("status", "active");
  const experts = (data ?? []) as Expert[];

  let ran = 0;
  for (const expert of experts) {
    try {
      const output = await runExpertOnReport({
        supabase,
        llm,
        expert,
        topic,
        reportId,
      });
      if (output) ran += 1;
    } catch (err) {
      console.error(`expert ${expert.kind} (${expert.id}) failed`, err);
    }
  }
  return ran;
}
