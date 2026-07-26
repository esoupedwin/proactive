"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SEED_TOPICS } from "./seed-data";
import { createSupabaseServerClient } from "./supabase/server";
import type { DetailLevel, Topic } from "./types";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const topicInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give your topic a short title.")
    .max(120, "Keep the title under 120 characters."),
  description: z
    .string()
    .trim()
    .min(10, "Describe what you want to understand (at least 10 characters)."),
  interest_areas: z
    .array(z.string().trim().min(1))
    .min(1, "Add at least one key interest area.")
    .max(10, "Keep it to 10 interest areas or fewer."),
  detail_level: z.enum(["brief", "standard", "deep"]),
  frequency: z.enum(["manual", "daily", "weekly"]),
  status: z.enum(["active", "paused"]),
});

export interface TopicFormState {
  error?: string;
  fieldErrors?: Partial<Record<string, string>>;
}

function parseTopicForm(formData: FormData) {
  const raw = {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    // One form field per item (itemized editor); tolerate pasted bullets.
    interest_areas: formData
      .getAll("interest_areas")
      .map((value) => String(value).replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean),
    detail_level: String(formData.get("detail_level") ?? "standard"),
    frequency: String(formData.get("frequency") ?? "daily"),
    status: String(formData.get("status") ?? "active"),
  };
  return topicInputSchema.safeParse(raw);
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

  revalidatePath(`/topics/${topicId}`);
  revalidatePath("/settings");
  redirect(`/topics/${topicId}`);
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
        interest_areas: seed.interest_areas,
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
