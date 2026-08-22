"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeUrl } from "./ai/dedupe";
import { generateInterestFrame } from "./ai/interest-frame";
import { generateNewsQuery } from "./ai/news-query";
import { openAiLlm } from "./ai/openai";
import { isGenerationLocked } from "./reports";
import { SEED_TOPICS } from "./seed-data";
import { createSupabaseServerClient } from "./supabase/server";
import { frameFactorNames, situationFacts } from "./types";
import type {
  DetailLevel,
  Expert,
  ExpertConfig,
  ExpertKind,
  FeedbackRating,
  InterestFactor,
  KnowledgeFact,
  MentorFocus,
  MentorLevel,
  MentorMemoryData,
  Report,
  Topic,
} from "./types";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const interestFactorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Every factor needs a name.")
    .max(80, "Keep factor names under 80 characters."),
  key_question: z.string().trim().max(300).catch(""),
  indicators: z
    .array(z.string().trim().min(1))
    .max(10)
    .catch([]),
});

const topicInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give your topic a short title.")
      .max(120, "Keep the title under 120 characters."),
    description: z
      .string()
      .trim()
      .min(10, "Describe what you want to understand (at least 10 characters)."),
    interest_frame: z
      .array(interestFactorSchema)
      .min(1, "Add at least one key factor.")
      .max(10, "Keep it to 10 factors or fewer."),
    watch_mode: z.enum(["monitor", "question", "trending"]),
    analytical_question: z.string().trim().max(300),
    detail_level: z.enum(["brief", "standard", "deep"]),
    frequency: z.enum(["manual", "daily", "every_3_days", "weekly"]),
    status: z.enum(["active", "paused"]),
  })
  .superRefine((data, ctx) => {
    if (data.watch_mode === "question" && !data.analytical_question) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["analytical_question"],
        message: "State the question this topic should answer.",
      });
    }
  })
  // Monitor topics never carry a stale question; store null, not "".
  .transform((data) => ({
    ...data,
    analytical_question:
      data.watch_mode === "question" ? data.analytical_question : null,
  }));

export interface TopicFormState {
  error?: string;
  fieldErrors?: Partial<Record<string, string>>;
}

/** The frame editor serializes its state into one hidden JSON field. */
function parseFrameField(value: FormDataEntryValue | null): unknown {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    // Blank rows (no factor name) are editor leftovers, not input errors.
    return parsed.filter(
      (f) =>
        typeof f === "object" &&
        f !== null &&
        String((f as { name?: unknown }).name ?? "").trim() !== "",
    );
  } catch {
    return [];
  }
}

function parseTopicForm(formData: FormData) {
  const raw = {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    interest_frame: parseFrameField(formData.get("interest_frame")),
    watch_mode: String(formData.get("watch_mode") ?? "monitor"),
    analytical_question: String(formData.get("analytical_question") ?? ""),
    detail_level: String(formData.get("detail_level") ?? "standard"),
    frequency: String(formData.get("frequency") ?? "daily"),
    status: String(formData.get("status") ?? "active"),
  };
  return topicInputSchema.safeParse(raw);
}

/**
 * Formulates and stores the topic's reusable news-search query at setup.
 * Best-effort — a missing OpenAI key or model hiccup never blocks saving
 * the topic; the related-news route regenerates lazily when missing.
 */
async function storeNewsQuery(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  topicId: string,
  topic: { title: string; description: string; interest_frame: InterestFactor[] },
): Promise<void> {
  try {
    const query = await generateNewsQuery(openAiLlm, {
      title: topic.title,
      description: topic.description,
      interest_areas: frameFactorNames(topic.interest_frame),
    });
    if (query) {
      await supabase
        .from("topics")
        .update({ news_query: query })
        .eq("id", topicId);
    }
  } catch (err) {
    console.error("news query generation failed", err);
  }
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Topic CRUD
// ---------------------------------------------------------------------------

export async function createTopic(
  _prev: TopicFormState,
  formData: FormData,
): Promise<TopicFormState> {
  const { supabase, user } = await requireUser();

  const parsed = parseTopicForm(formData);
  if (!parsed.success) {
    return { fieldErrors: flattenErrors(parsed.error) };
  }

  const { data: topic, error } = await supabase
    .from("topics")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single<{ id: string }>();

  if (error || !topic) {
    return { error: "Could not create the topic. Please try again." };
  }

  // "Formulated when the topic is first set up" — stored for reuse.
  await storeNewsQuery(supabase, topic.id, parsed.data);

  revalidatePath("/settings");
  redirect(`/topics/${topic.id}`);
}

export async function updateTopic(
  topicId: string,
  _prev: TopicFormState,
  formData: FormData,
): Promise<TopicFormState> {
  const { supabase } = await requireUser();

  const parsed = parseTopicForm(formData);
  if (!parsed.success) {
    return { fieldErrors: flattenErrors(parsed.error) };
  }

  const { error } = await supabase
    .from("topics")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", topicId);

  if (error) {
    return { error: "Could not save changes. Please try again." };
  }

  // The topic's scope may have changed — refresh the stored search query.
  await storeNewsQuery(supabase, topicId, parsed.data);

  revalidatePath(`/topics/${topicId}`);
  revalidatePath("/settings");
  redirect(`/topics/${topicId}`);
}

/**
 * Drafts a topic's key factors from its title/goal (and analytical question,
 * if any) for the form's "Suggest factors" button. The user edits the draft
 * before saving — nothing is persisted here.
 *
 * Named for the `interest_frame` column it fills; "Key factors" is what the
 * UI calls it.
 */
export async function draftInterestFrame(input: {
  title: string;
  description: string;
  analytical_question?: string | null;
}): Promise<{ factors?: InterestFactor[]; error?: string }> {
  await requireUser();
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title && !description) {
    return { error: "Fill in the title and goal first." };
  }
  try {
    const factors = await generateInterestFrame(openAiLlm, {
      title,
      description,
      analytical_question: input.analytical_question?.trim() || null,
    });
    return { factors };
  } catch (err) {
    console.error("interest frame drafting failed", err);
    return { error: "Could not draft factors. Add them manually or retry." };
  }
}

function flattenErrors(error: z.ZodError): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function toggleTopicStatus(topicId: string): Promise<void> {
  const { supabase } = await requireUser();

  const { data: topic } = await supabase
    .from("topics")
    .select("status")
    .eq("id", topicId)
    .maybeSingle<Pick<Topic, "status">>();
  if (!topic) return;

  await supabase
    .from("topics")
    .update({
      status: topic.status === "active" ? "paused" : "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", topicId);

  revalidatePath("/settings");
  revalidatePath(`/topics/${topicId}`);
}

/**
 * Wipes everything a topic has learned — extracts, reports and every memory —
 * while keeping the topic and its experts configured exactly as they are. The
 * next update starts from nothing, as if the topic had just been created.
 *
 * Two deletes do most of the work through FK cascades: removing reports takes
 * their sources, expert outputs and feedback with them; removing extracts
 * takes their assessments.
 */
export async function resetTopic(topicId: string): Promise<void> {
  const { supabase } = await requireUser();

  // RLS scopes every statement below to the signed-in user; this only turns a
  // bad id into a no-op rather than a silent partial wipe.
  const { data: topic } = await supabase
    .from("topics")
    .select("id")
    .eq("id", topicId)
    .maybeSingle<Pick<Topic, "id">>();
  if (!topic) redirect("/settings");

  // Resetting under a live run would delete the rows it is still writing to,
  // and it would repopulate the topic seconds later.
  const { data: latestGenerating } = await supabase
    .from("reports")
    .select("status, created_at")
    .eq("topic_id", topicId)
    .eq("status", "generating")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<Report, "status" | "created_at">>();
  if (isGenerationLocked(latestGenerating)) {
    redirect(`/topics/${topicId}/edit?error=generating`);
  }

  // Expert memory is keyed by expert, not topic — resolve the ids first. The
  // experts themselves are configuration and stay.
  const { data: expertRows } = await supabase
    .from("experts")
    .select("id")
    .eq("topic_id", topicId);
  const expertIds = ((expertRows ?? []) as Pick<Expert, "id">[]).map(
    (e) => e.id,
  );
  if (expertIds.length > 0) {
    await supabase.from("expert_memory").delete().in("expert_id", expertIds);
  }

  await supabase.from("reports").delete().eq("topic_id", topicId);
  await supabase.from("extracts").delete().eq("topic_id", topicId);
  await supabase.from("agent_state").delete().eq("topic_id", topicId);
  await supabase.from("topic_memory").delete().eq("topic_id", topicId);

  // Clear the schedule anchor so the topic is due again immediately.
  await supabase
    .from("topics")
    .update({ last_generated_at: null, updated_at: new Date().toISOString() })
    .eq("id", topicId);

  revalidatePath(`/topics/${topicId}`);
  revalidatePath(`/topics/${topicId}/history`);
  revalidatePath(`/topics/${topicId}/extracts`);
  revalidatePath("/settings");
  redirect(`/topics/${topicId}`);
}

export async function deleteTopic(topicId: string): Promise<void> {
  const { supabase, user } = await requireUser();

  await supabase.from("topics").delete().eq("id", topicId);

  // Clear the last-viewed pointer if it referenced the deleted topic.
  await supabase
    .from("profiles")
    .update({ last_viewed_topic_id: null })
    .eq("id", user.id)
    .eq("last_viewed_topic_id", topicId);

  revalidatePath("/settings");
  redirect("/settings");
}

// ---------------------------------------------------------------------------
// Experts
// ---------------------------------------------------------------------------

/** One of `allowed`, or `fallback` when the form sent anything else. */
function parseChoice<T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[],
  fallback: T,
): T {
  const choice = String(value ?? "") as T;
  return allowed.includes(choice) ? choice : fallback;
}

const MENTOR_LEVELS = ["basic", "intermediate", "advanced"] as const;
const MENTOR_FOCUSES = ["concepts", "entities"] as const;
const PERSONALITY_MODES = ["stance", "profiles"] as const;

function parseMentorConfig(formData: FormData): {
  level: MentorLevel;
  teaching_focus: MentorFocus;
} {
  return {
    level: parseChoice(formData.get("level"), MENTOR_LEVELS, "basic"),
    teaching_focus: parseChoice(
      formData.get("teaching_focus"),
      MENTOR_FOCUSES,
      "concepts",
    ),
  };
}

/** Long enough for "Prof. James Chin"; short enough to sit in a panel header. */
const EXPERT_NAME_MAX = 60;

/**
 * The specialization is injected into EVERY analyst run on the report tier —
 * an unbounded paste would silently multiply per-report token cost.
 */
const ANALYST_FOCUS_MAX = 4000;

/**
 * Like the analyst's specialization, the issue is injected into every
 * stance-mode run — keep pasted text bounded.
 */
const PERSONALITY_ISSUE_MAX = 1000;

/** A display name for an expert; blank falls back to the kind's default. */
function parseExpertName(
  value: FormDataEntryValue | null,
  fallback: string,
): string {
  const name = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXPERT_NAME_MAX);
  return name || fallback;
}

function parseBoundedText(
  value: FormDataEntryValue | null,
  max: number,
): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

/** Both pages that list experts also show them on the briefing. */
function revalidateExpertPaths(topicId: string): void {
  revalidatePath(`/topics/${topicId}/experts`);
  revalidatePath(`/topics/${topicId}`);
}

/** Adds an expert to a topic and returns to its experts page. */
async function addExpert(
  topicId: string,
  expert: { kind: ExpertKind; name: string; config: ExpertConfig },
): Promise<void> {
  const { supabase, user } = await requireUser();

  await supabase.from("experts").insert({
    topic_id: topicId,
    user_id: user.id,
    status: "active",
    ...expert,
  });

  revalidateExpertPaths(topicId);
  redirect(`/topics/${topicId}/experts`);
}

/**
 * Applies a patch to one expert, given its current row. `patch` receives the
 * stored config so callers can merge into it; returning nothing skips the write.
 */
async function updateExpert(
  expertId: string,
  patch: (
    current: Pick<Expert, "topic_id" | "config" | "status">,
  ) => Partial<Pick<Expert, "name" | "config" | "status">>,
): Promise<void> {
  const { supabase } = await requireUser();

  const { data: expert } = await supabase
    .from("experts")
    .select("topic_id, config, status")
    .eq("id", expertId)
    .maybeSingle<Pick<Expert, "topic_id" | "config" | "status">>();
  if (!expert) return;

  await supabase
    .from("experts")
    .update({ ...patch(expert), updated_at: new Date().toISOString() })
    .eq("id", expertId);

  revalidateExpertPaths(expert.topic_id);
}

export async function addMentorExpert(
  topicId: string,
  formData: FormData,
): Promise<void> {
  await addExpert(topicId, {
    kind: "mentor",
    name: "Mentor",
    config: parseMentorConfig(formData),
  });
}

export async function addAnalystExpert(
  topicId: string,
  formData: FormData,
): Promise<void> {
  const focus = parseBoundedText(formData.get("focus"), ANALYST_FOCUS_MAX);
  await addExpert(topicId, {
    kind: "analyst",
    name: parseExpertName(formData.get("name"), "Analyst"),
    // Empty focus falls back to the topic's own description at run time.
    config: focus ? { focus } : {},
  });
}

export async function addSentimentExpert(topicId: string): Promise<void> {
  await addExpert(topicId, {
    kind: "sentiment",
    name: "Public Sentiment",
    config: {},
  });
}

export async function addPersonalityExpert(
  topicId: string,
  formData: FormData,
): Promise<void> {
  const mode = parseChoice(
    formData.get("personality_mode"),
    PERSONALITY_MODES,
    "stance",
  );
  const issue = parseBoundedText(
    formData.get("issue"),
    PERSONALITY_ISSUE_MAX,
  );
  await addExpert(topicId, {
    kind: "personality",
    name: parseExpertName(formData.get("name"), "Personality"),
    // Stance mode with an empty issue falls back to the topic's own
    // analytical question (or description) at run time.
    config: {
      personality_mode: mode,
      ...(mode === "stance" && issue ? { issue } : {}),
    },
  });
}

/**
 * Personality display name + tracked issue. The mode is fixed at creation —
 * its memory (roster vs profiled names) wouldn't survive a switch; add a
 * second Personality expert for the other mode instead.
 */
export async function updatePersonalitySettings(
  expertId: string,
  formData: FormData,
): Promise<void> {
  const issue = parseBoundedText(
    formData.get("issue"),
    PERSONALITY_ISSUE_MAX,
  );
  await updateExpert(expertId, (expert) => ({
    name: parseExpertName(formData.get("name"), "Personality"),
    config:
      expert.config.personality_mode === "stance"
        ? { ...expert.config, issue: issue || undefined }
        : expert.config,
  }));
}

/** Analyst display name + specialization. */
export async function updateAnalystSettings(
  expertId: string,
  formData: FormData,
): Promise<void> {
  const focus = parseBoundedText(formData.get("focus"), ANALYST_FOCUS_MAX);
  await updateExpert(expertId, (expert) => ({
    name: parseExpertName(formData.get("name"), "Analyst"),
    config: { ...expert.config, focus: focus || undefined },
  }));
}

export async function updateMentorSettings(
  expertId: string,
  formData: FormData,
): Promise<void> {
  await updateExpert(expertId, (expert) => ({
    config: { ...expert.config, ...parseMentorConfig(formData) },
  }));
}

export async function toggleExpertStatus(expertId: string): Promise<void> {
  await updateExpert(expertId, (expert) => ({
    status: expert.status === "active" ? "paused" : "active",
  }));
}

export async function deleteExpert(expertId: string): Promise<void> {
  const { supabase } = await requireUser();

  const { data: expert } = await supabase
    .from("experts")
    .select("topic_id")
    .eq("id", expertId)
    .maybeSingle<Pick<Expert, "topic_id">>();

  await supabase.from("experts").delete().eq("id", expertId);

  if (expert) {
    revalidateExpertPaths(expert.topic_id);
    // Deleting happens on the expert's own page — leave it before it 404s.
    redirect(`/topics/${expert.topic_id}/experts`);
  }
}

/**
 * Feedback on a Mentor tip: 'known' — never teach this again;
 * 'remind' — bring it back in a future report.
 */
export async function mentorTipFeedback(
  expertId: string,
  concept: string,
  feedback: "known" | "remind",
): Promise<void> {
  const { supabase, user } = await requireUser();

  const { data: row } = await supabase
    .from("expert_memory")
    .select("memory")
    .eq("expert_id", expertId)
    .maybeSingle<{ memory: MentorMemoryData }>();
  const memory: MentorMemoryData = row?.memory ?? { taught: [] };

  const status = feedback === "known" ? "known" : "revisit";
  const key = concept.trim().toLowerCase();
  const existing = memory.taught.find(
    (t) => t.concept.toLowerCase() === key,
  );
  if (existing) {
    existing.status = status;
  } else {
    memory.taught.push({
      concept: concept.trim(),
      status,
      times: 1,
      last_taught_at: new Date().toISOString(),
    });
  }

  await supabase.from("expert_memory").upsert({
    expert_id: expertId,
    user_id: user.id,
    memory,
    updated_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Situation facts (the Reporter's standing facts for a question topic)
// ---------------------------------------------------------------------------

/** Bounded like the other prompt-injected text — every fact rides in every run. */
const FACT_TEXT_MAX = 300;

async function loadTopicFacts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  topicId: string,
): Promise<KnowledgeFact[]> {
  const { data } = await supabase
    .from("topic_memory")
    .select("facts")
    .eq("topic_id", topicId)
    .maybeSingle<{ facts: KnowledgeFact[] | null }>();
  // The panel indexes into this same filtered list, so edits land on the
  // right fact even when legacy kind-less entries sit alongside.
  return situationFacts(data?.facts ?? []);
}

async function storeTopicFacts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  topicId: string,
  userId: string,
  facts: KnowledgeFact[],
): Promise<void> {
  await supabase.from("topic_memory").upsert(
    {
      topic_id: topicId,
      user_id: userId,
      facts,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "topic_id" },
  );
  revalidatePath(`/topics/${topicId}`);
}

/**
 * Corrects one fact's text in place (by index — facts have no ids). A
 * corrected fact is marked as user-verified in its source note so the
 * reporter's own revisions do not quietly overwrite what you fixed by hand.
 */
export async function updateTopicFact(
  topicId: string,
  index: number,
  formData: FormData,
): Promise<void> {
  const { supabase, user } = await requireUser();
  const facts = await loadTopicFacts(supabase, topicId);
  const current = facts[index];
  if (!current) return;

  const text = parseBoundedText(formData.get("fact"), FACT_TEXT_MAX);
  if (!text) return;
  const asOf = parseBoundedText(formData.get("as_of"), 10);

  facts[index] = {
    ...current,
    fact: text,
    confidence: "high",
    source_note: "Corrected by you",
    ...(current.kind === "state" ? { as_of: asOf || null } : {}),
  };
  await storeTopicFacts(supabase, topicId, user.id, facts);
}

export async function deleteTopicFact(
  topicId: string,
  index: number,
): Promise<void> {
  const { supabase, user } = await requireUser();
  const facts = await loadTopicFacts(supabase, topicId);
  if (index < 0 || index >= facts.length) return;
  facts.splice(index, 1);
  await storeTopicFacts(supabase, topicId, user.id, facts);
}

/**
 * Clears every fact so the next report establishes the situation afresh —
 * the one way to make the reporter search again.
 */
export async function clearTopicFacts(topicId: string): Promise<void> {
  const { supabase, user } = await requireUser();
  await storeTopicFacts(supabase, topicId, user.id, []);
}

// ---------------------------------------------------------------------------
// Report feedback (the Reporter agent reads this on its next run)
// ---------------------------------------------------------------------------

export async function submitReportFeedback(
  reportId: string,
  rating: FeedbackRating,
  comment?: string,
): Promise<void> {
  if (rating !== "up" && rating !== "down") return;
  const { supabase, user } = await requireUser();

  // RLS scopes this to the caller's own reports.
  const { data: report } = await supabase
    .from("reports")
    .select("id, topic_id")
    .eq("id", reportId)
    .maybeSingle<{ id: string; topic_id: string }>();
  if (!report) return;

  const trimmed = comment?.trim().slice(0, 1000) || null;
  await supabase.from("report_feedback").upsert(
    {
      report_id: report.id,
      topic_id: report.topic_id,
      user_id: user.id,
      rating,
      comment: trimmed,
      created_at: new Date().toISOString(),
    },
    { onConflict: "report_id,user_id" },
  );

  revalidatePath(`/topics/${report.topic_id}`);
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function updateProfilePreferences(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();

  const detail = String(formData.get("default_detail_level") ?? "standard");
  const expertise = String(formData.get("expertise_level") ?? "").trim();
  const allowed: DetailLevel[] = ["brief", "standard", "deep"];

  await supabase
    .from("profiles")
    .update({
      default_detail_level: allowed.includes(detail as DetailLevel)
        ? detail
        : "standard",
      expertise_level: expertise || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  revalidatePath("/settings");
}

const FONT_WEIGHTS = [300, 400, 500] as const;

export async function updateDisplaySettings(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();

  const requested = Number(formData.get("font_weight"));
  const fontWeight = (FONT_WEIGHTS as readonly number[]).includes(requested)
    ? requested
    : 400;

  await supabase
    .from("profiles")
    .update({ font_weight: fontWeight, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  // The weight is applied in the root layout — refresh everything.
  revalidatePath("/", "layout");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Seed sample topics (onboarding)
// ---------------------------------------------------------------------------

export async function seedSampleTopics(): Promise<void> {
  const { supabase, user } = await requireUser();

  const now = Date.now();
  let created = 0;
  let firstError: string | null = null;

  for (const [index, seed] of SEED_TOPICS.entries()) {
    const latestReport = seed.reports[seed.reports.length - 1];
    const lastGeneratedAt = latestReport
      ? new Date(now - latestReport.days_ago * 86_400_000).toISOString()
      : null;

    const { data: topic, error } = await supabase
      .from("topics")
      .insert({
        user_id: user.id,
        title: seed.title,
        description: seed.description,
        interest_frame: seed.interest_frame,
        detail_level: seed.detail_level,
        frequency: seed.frequency,
        status: "active",
        position: index,
        last_generated_at: lastGeneratedAt,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !topic) {
      firstError ??= error?.message ?? "unknown error";
      console.error("seeding topic failed", seed.title, error);
      continue;
    }
    created++;

    for (const report of seed.reports) {
      const createdAt = new Date(now - report.days_ago * 86_400_000).toISOString();
      const { data: reportRow } = await supabase
        .from("reports")
        .insert({
          topic_id: topic.id,
          user_id: user.id,
          status: "ready",
          sections: report.sections,
          summary: report.summary,
          created_at: createdAt,
          completed_at: createdAt,
        })
        .select("id")
        .single<{ id: string }>();
      if (!reportRow) continue;

      if (report.sources.length > 0) {
        await supabase.from("sources").insert(
          report.sources.map((s) => ({
            report_id: reportRow.id,
            topic_id: topic.id,
            user_id: user.id,
            ...s,
          })),
        );

        // Mirror seed sources into the persistent extract store so the
        // extracts page isn't empty before the first tracker run. No
        // embeddings (keyword search still works); duplicates are ignored.
        try {
          await supabase.from("extracts").upsert(
            report.sources.map((s) => ({
              topic_id: topic.id,
              user_id: user.id,
              source_type: s.source_type,
              title: s.title,
              publisher: s.publisher || null,
              url: s.url,
              canonical_url: normalizeUrl(s.url),
              published_at: s.published_at || null,
              gist: s.gist,
              relevance: s.relevance || null,
              novelty: s.novelty === "repeat" ? null : s.novelty,
              created_at: createdAt,
            })),
            { onConflict: "topic_id,canonical_url", ignoreDuplicates: true },
          );
        } catch (err) {
          console.error("seeding extracts failed", err);
        }
      }
    }

    // Seed topic memory; reported developments come from the latest report.
    const reported = (latestReport?.sections.latest_developments ?? []).map(
      (b) => ({
        id: crypto.randomUUID(),
        text: b.text,
        first_reported_at: lastGeneratedAt ?? new Date(now).toISOString(),
      }),
    );
    await supabase.from("topic_memory").upsert({
      topic_id: topic.id,
      user_id: user.id,
      reported_developments: reported,
      themes: seed.memory.themes,
      facts: seed.memory.facts,
      open_questions: seed.memory.open_questions,
      updated_at: new Date(now).toISOString(),
    });
  }

  if (created === 0) {
    // Surface the failure instead of silently bouncing back to onboarding.
    redirect(`/onboarding?error=${encodeURIComponent(firstError ?? "seed failed")}`);
  }

  revalidatePath("/settings");
  redirect("/");
}

// ---------------------------------------------------------------------------
// Last-viewed tracking
// ---------------------------------------------------------------------------

export async function rememberLastViewedTopic(topicId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profiles")
    .update({ last_viewed_topic_id: topicId })
    .eq("id", user.id);
}
