import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Expert,
  ExpertMemoryData,
  ExpertOutput,
  ExpertOutputData,
  MentorMemoryData,
  ReportSections,
  Source,
  Topic,
} from "../../types";
import type { Llm } from "../llm";
import { diffUsage, type UsageCollector } from "../usage";
import { runAnalyst } from "./analyst";
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
  /** The collector bound to `llm`; used to attribute this run's cost. */
  usage?: UsageCollector;
}): Promise<ExpertOutput | null> {
  const { supabase, llm, expert, topic, reportId, usage } = options;

  const { data: report } = await supabase
    .from("reports")
    .select("sections")
    .eq("id", reportId)
    .maybeSingle<{ sections: ReportSections | null }>();
  if (!report?.sections) return null;

  // A "nothing changed" report has no new substance to teach or analyse, so
  // running an expert on it would spend tokens restating the previous update.
  if (report.sections.no_meaningful_change) return null;

  const { data: memoryRow } = await supabase
    .from("expert_memory")
    .select("memory")
    .eq("expert_id", expert.id)
    .maybeSingle<{ memory: ExpertMemoryData }>();

  let output: ExpertOutputData;
  // Only experts that remember something across runs set this.
  let newMemory: ExpertMemoryData | undefined;
  const usageBefore = usage?.snapshot();

  switch (expert.kind) {
    case "mentor": {
      const memory: MentorMemoryData = {
        taught: memoryRow?.memory?.taught ?? [],
      };
      const result = await runMentor(
        llm,
        topic,
        report.sections,
        expert.config.level ?? "basic",
        expert.config.teaching_focus ?? "concepts",
        memory,
      );
      output = { tips: result.tips };
      newMemory = result.memory;
      break;
    }

    case "analyst": {
      // The analyst also sees the report's sources so it can weigh
      // reported fact vs community sentiment vs interpretation.
      const { data: sourceRows } = await supabase
        .from("sources")
        .select("source_type, gist, novelty, contradiction")
        .eq("report_id", reportId);
      const extracts = ((sourceRows ?? []) as Source[]).map((s) => ({
        source_type: s.source_type,
        gist: s.gist,
        novelty: s.novelty ?? "",
        contradiction: s.contradiction ?? "",
      }));

      const result = await runAnalyst(
        llm,
        topic,
        report.sections,
        expert.config.focus?.trim() ||
          `${topic.title} — ${topic.description}`,
        extracts,
      );
      output = { analysis: result.analysis };
      // The analyst writes standalone commentary — it carries no memory.
      break;
    }

    default:
      return null;
  }

  // Attribute exactly this run's share of the shared collector to the output.
  if (usage && usageBefore) {
    output.usage = diffUsage(usageBefore, usage.snapshot());
  }

  const { data: outputRow, error } = await supabase
    .from("expert_outputs")
    .upsert(
      {
        expert_id: expert.id,
        report_id: reportId,
        topic_id: topic.id,
        user_id: expert.user_id,
        kind: expert.kind,
        output,
      },
      { onConflict: "expert_id,report_id" },
    )
    .select("*")
    .single<ExpertOutput>();
  if (error) throw new Error(`saving expert output failed: ${error.message}`);

  if (newMemory) {
    await supabase.from("expert_memory").upsert({
      expert_id: expert.id,
      user_id: expert.user_id,
      memory: newMemory,
      updated_at: new Date().toISOString(),
    });
  }

  return outputRow;
}

/** Runs every active expert attached to a topic; one failure never blocks the rest. */
export async function runActiveExpertsForReport(options: {
  supabase: SupabaseClient;
  llm: Llm;
  topic: Topic;
  reportId: string;
  usage?: UsageCollector;
}): Promise<number> {
  const { supabase, llm, topic, reportId, usage } = options;

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
        usage,
      });
      if (output) ran += 1;
    } catch (err) {
      console.error(`expert ${expert.kind} (${expert.id}) failed`, err);
    }
  }
  return ran;
}
