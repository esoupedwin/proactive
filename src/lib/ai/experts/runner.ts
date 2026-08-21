import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isAnalystCommentary,
  type Expert,
  type ExpertMemoryData,
  type ExpertOutput,
  type ExpertOutputData,
  type ExtractRecord,
  type MentorMemoryData,
  type ReportSections,
  type Source,
  type Topic,
} from "../../types";
import { normalizeUrl } from "../dedupe";
import type { Llm } from "../llm";
import { diffUsage, type UsageCollector } from "../usage";
import {
  runAnalyst,
  type AnalystPriorCommentary,
} from "./analyst";
import { runMentor } from "./mentor";
import {
  attachWikiImages,
  baselineRoster,
  mergeProfiledNames,
  mergeStanceUpdates,
  profilesForOutput,
  runPersonalityBaseline,
  runPersonalityProfiles,
  runPersonalityUpdate,
  stancesForOutput,
  type PersonalityExtractSummary,
} from "./personality";
import { runSentiment } from "./sentiment";

/** Bound the analyst's per-run reading so cost stays predictable. */
const ANALYST_MAX_NEW_EXTRACTS = 10;
const ANALYST_PRIOR_COMMENTARIES = 3;
/** Bound the personality tracker's per-run reading likewise. */
const PERSONALITY_MAX_NEW_EXTRACTS = 15;

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
        .select("source_type, url, gist, novelty, contradiction")
        .eq("report_id", reportId);
      const reportSources = (sourceRows ?? []) as Source[];
      const extracts = reportSources.map((s) => ({
        source_type: s.source_type,
        gist: s.gist,
        novelty: s.novelty ?? "",
        contradiction: s.contradiction ?? "",
      }));

      // The raw record since its last review — including extracts the report
      // did not cite — so it can challenge the assessment, not just echo it.
      const cursor = memoryRow?.memory?.extract_cursor;
      let extractQuery = supabase
        .from("extracts")
        .select(
          "source_type, title, canonical_url, factor, published_at, gist, novelty, contradiction, corroborations, created_at",
        )
        .eq("topic_id", topic.id)
        .order("created_at", { ascending: false })
        .limit(ANALYST_MAX_NEW_EXTRACTS);
      if (cursor) extractQuery = extractQuery.gt("created_at", cursor);
      const { data: extractRows } = await extractQuery;
      const newRows = ((extractRows ?? []) as ExtractRecord[]).reverse();

      const citedUrls = new Set(
        reportSources.map((s) => normalizeUrl(s.url)),
      );
      const newExtracts = newRows.map((e) => ({
        source_type: e.source_type,
        title: e.title,
        factor: e.factor,
        published_at: e.published_at,
        gist: e.gist,
        novelty: e.novelty ?? "",
        contradiction: e.contradiction ?? "",
        corroborations: e.corroborations,
        cited_in_report: citedUrls.has(e.canonical_url),
        recorded_at: e.created_at,
      }));

      // Its own recent commentaries, for continuity across reports.
      const { data: priorRows } = await supabase
        .from("expert_outputs")
        .select("output, created_at")
        .eq("expert_id", expert.id)
        .neq("report_id", reportId)
        .order("created_at", { ascending: false })
        .limit(ANALYST_PRIOR_COMMENTARIES);
      const previousCommentaries: AnalystPriorCommentary[] = (
        (priorRows ?? []) as Pick<ExpertOutput, "output" | "created_at">[]
      )
        .flatMap(({ output: prior, created_at }) => {
          const analysis = prior.analysis;
          if (!analysis) return [];
          const text = isAnalystCommentary(analysis)
            ? analysis.commentary
            : analysis.assessment; // pre-redesign shape
          return text ? [{ at: created_at, commentary: text }] : [];
        })
        .reverse(); // oldest first, so the narrative reads forward

      const result = await runAnalyst(
        llm,
        topic,
        report.sections,
        expert.config.focus?.trim() ||
          `${topic.title} — ${topic.description}`,
        extracts,
        newExtracts,
        previousCommentaries,
      );
      output = { analysis: result.analysis };
      // Advance the reading cursor past everything reviewed this run.
      const lastSeen = newRows[newRows.length - 1]?.created_at;
      if (lastSeen) {
        newMemory = { ...memoryRow?.memory, extract_cursor: lastSeen };
      }
      break;
    }

    case "personality": {
      const mode = expert.config.personality_mode ?? "stance";
      const memory = memoryRow?.memory ?? {};

      if (mode === "profiles") {
        const result = await runPersonalityProfiles(
          llm,
          topic,
          report.sections,
          memory.profiled ?? [],
        );
        const profiles = await attachWikiImages(
          profilesForOutput(result.profiles),
        );
        output = { personality: { mode, profiles } };
        if (result.profiles.length > 0) {
          newMemory = {
            ...memory,
            profiled: mergeProfiledNames(memory, result.profiles),
          };
        }
        break;
      }

      // Stance mode. The tracked issue falls back to the topic's own question.
      const issue =
        expert.config.issue?.trim() ||
        topic.analytical_question?.trim() ||
        `${topic.title} — ${topic.description}`;
      const roster = memory.personalities ?? [];
      const now = new Date().toISOString();

      if (roster.length === 0) {
        // First run: scan the web for the key players and store the baseline.
        const { players } = await runPersonalityBaseline(llm, topic, issue);
        const baseline = await attachWikiImages(baselineRoster(players, now));
        output = {
          personality: {
            mode,
            issue,
            baseline: true,
            stances: stancesForOutput(baseline, null),
          },
        };
        newMemory = { ...memory, personalities: baseline };
        break;
      }

      // Later runs: test each stance against the report and the raw record
      // since the last review.
      const cursor = memory.extract_cursor;
      let extractQuery = supabase
        .from("extracts")
        .select("source_type, title, published_at, gist, created_at")
        .eq("topic_id", topic.id)
        .order("created_at", { ascending: false })
        .limit(PERSONALITY_MAX_NEW_EXTRACTS);
      if (cursor) extractQuery = extractQuery.gt("created_at", cursor);
      const { data: extractRows } = await extractQuery;
      const newRows = (
        (extractRows ?? []) as Pick<
          ExtractRecord,
          "source_type" | "title" | "published_at" | "gist" | "created_at"
        >[]
      ).reverse();
      const newExtracts: PersonalityExtractSummary[] = newRows.map((e) => ({
        source_type: e.source_type,
        title: e.title,
        published_at: e.published_at,
        gist: e.gist,
        recorded_at: e.created_at,
      }));

      const { updates } = await runPersonalityUpdate(
        llm,
        topic,
        report.sections,
        issue,
        roster,
        newExtracts,
      );
      // New players may have joined the roster — give them portraits too.
      const merged = await attachWikiImages(
        mergeStanceUpdates(roster, updates, now),
      );
      output = {
        personality: { mode, issue, stances: stancesForOutput(merged, updates) },
      };
      const lastSeen = newRows[newRows.length - 1]?.created_at;
      newMemory = {
        ...memory,
        personalities: merged,
        ...(lastSeen ? { extract_cursor: lastSeen } : {}),
      };
      break;
    }

    case "sentiment": {
      // Searches Reddit itself via the hosted web_search tool — needs only
      // the report to know which points to check the public mood on.
      const result = await runSentiment(llm, topic, report.sections);
      output = { sentiment: result.sentiment };
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
