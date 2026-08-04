import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Bot, ChevronLeft, Landmark } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { Markdown } from "@/components/markdown";
import { MarkdownTextarea } from "@/components/markdown-textarea";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Field, Input, Select } from "@/components/ui";
import {
  deleteExpert,
  toggleExpertStatus,
  updateAnalystSettings,
  updateMentorSettings,
} from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Expert } from "@/lib/types";

export const dynamic = "force-dynamic";

const LEVEL_OPTIONS = [
  { value: "basic", label: "Basic — explain like I'm new to this" },
  { value: "intermediate", label: "Intermediate — I have working knowledge" },
  { value: "advanced", label: "Advanced — only non-obvious context" },
];

const FOCUS_OPTIONS = [
  { value: "concepts", label: "Key concepts and background" },
  {
    value: "entities",
    label: "People & organisations — who they are and how they relate",
  },
];

/** Manage one expert: settings, pause/resume, remove. */
export default async function ExpertDetailPage({
  params,
}: {
  params: Promise<{ topicId: string; expertId: string }>;
}) {
  const { topicId, expertId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("experts")
    .select("*")
    .eq("id", expertId)
    .eq("topic_id", topicId)
    .maybeSingle<Expert>();
  if (!data) notFound();
  const expert = data;
  const isAnalyst = expert.kind === "analyst";

  return (
    <main className="px-5 pb-16 pt-6">
      <header className="mb-6 border-b border-rule pb-4">
        <Link
          href={`/topics/${topicId}/experts`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-faint hover:text-ink"
        >
          <LinkPending>
            <ChevronLeft className="size-4" aria-hidden />
          </LinkPending>{" "}
          Experts
        </Link>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-rule bg-neutral-50"
          >
            {isAnalyst ? (
              <Landmark className="size-5" />
            ) : (
              <Bot className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {expert.name}
            </h1>
            <p className="text-xs text-ink-faint">
              {isAnalyst
                ? "An independent read of each report through your chosen lens — short commentary that refines or challenges the briefing."
                : "Explains key concepts, entities, and relationships in each report. Remembers what you already know."}
            </p>
          </div>
          <Badge tone={expert.status === "active" ? "active" : "paused"}>
            {expert.status}
          </Badge>
        </div>
      </header>

      {isAnalyst ? (
        <form
          action={updateAnalystSettings.bind(null, expert.id)}
          className="space-y-3"
        >
          <Field
            label="Name"
            htmlFor="analyst_name"
            hint="What this analyst is called on the briefing. Leave empty for “Analyst”."
          >
            <Input
              id="analyst_name"
              name="name"
              maxLength={60}
              defaultValue={expert.name}
              placeholder="e.g. Prof. James Chin"
            />
          </Field>
          <Field
            label="Specialization"
            htmlFor="focus"
            hint="What the analyst focuses on. Markdown works — headings, bullet lists and **bold** are passed through and followed, and pasting formatted text converts it to Markdown. Leave empty to analyze the topic broadly."
          >
            <MarkdownTextarea
              id="focus"
              name="focus"
              rows={10}
              defaultValue={expert.config.focus ?? ""}
              placeholder={"e.g. Malaysia's domestic politics, governance, power dynamics, and society\n\n## Use language such as\n- increases bargaining leverage\n- alters incentive structure"}
            />
          </Field>
          <SubmitButton variant="outline" pendingLabel="Saving…">
            Save analyst
          </SubmitButton>
          {expert.config.focus?.trim() && (
            <div className="rounded-md border border-rule bg-neutral-50 px-4 py-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-ink-faint">
                Saved specialization, as the analyst reads it
              </p>
              <Markdown text={expert.config.focus} />
            </div>
          )}
        </form>
      ) : (
        <form
          action={updateMentorSettings.bind(null, expert.id)}
          className="space-y-3"
        >
          <Field
            label="Teaching level"
            htmlFor="level"
            hint="How basic or advanced Mentor's explanations should be."
          >
            <Select
              id="level"
              name="level"
              defaultValue={expert.config.level ?? "basic"}
            >
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Teaching focus"
            htmlFor="teaching_focus"
            hint="“People & organisations” highlights relationships between mentioned entities (e.g. UMNO is part of Barisan Nasional) and fact-checks them with a web search."
          >
            <Select
              id="teaching_focus"
              name="teaching_focus"
              defaultValue={expert.config.teaching_focus ?? "concepts"}
            >
              {FOCUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <SubmitButton variant="outline" pendingLabel="Saving…">
            Save teaching settings
          </SubmitButton>
        </form>
      )}

      <div className="mt-6 space-y-4 border-t border-rule pt-5">
        <div className="flex flex-wrap gap-2">
          <form action={toggleExpertStatus.bind(null, expert.id)}>
            <SubmitButton
              variant="outline"
              pendingLabel={
                expert.status === "active" ? "Pausing…" : "Resuming…"
              }
            >
              {expert.status === "active" ? "Pause" : "Resume"} {expert.name}
            </SubmitButton>
          </form>
          <form action={deleteExpert.bind(null, expert.id)}>
            <SubmitButton
              variant="danger"
              pendingLabel="Removing…"
              confirm={
                isAnalyst
                  ? `Remove ${expert.name}? Its commentary on this topic's reports will be deleted too.`
                  : "Remove Mentor? What it remembers teaching you for this topic will be deleted too."
              }
            >
              Remove {expert.name}
            </SubmitButton>
          </form>
        </div>
        <p className="text-xs text-ink-faint">
          {expert.status === "active"
            ? isAnalyst
              ? `Removing ${expert.name} also deletes its commentary on this topic's reports.`
              : "Removing Mentor also deletes what it remembers teaching you for this topic."
            : `While paused, ${expert.name} skips new reports and its section is hidden from the briefing.`}
        </p>
        <Link
          href={`/topics/${topicId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink hover:underline"
        >
          See {expert.name} on the briefing{" "}
          <LinkPending>
            <ArrowRight className="size-3.5" aria-hidden />
          </LinkPending>
        </Link>
      </div>
    </main>
  );
}
