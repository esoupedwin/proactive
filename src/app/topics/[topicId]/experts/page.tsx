import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Bot, ChevronLeft, Landmark } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { Markdown } from "@/components/markdown";
import { MarkdownTextarea } from "@/components/markdown-textarea";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Field, Input, Select } from "@/components/ui";
import {
  addAnalystExpert,
  addMentorExpert,
  deleteExpert,
  toggleExpertStatus,
  updateAnalystSettings,
  updateMentorSettings,
} from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Expert, Topic } from "@/lib/types";

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

/** Manage the experts attached to a topic. */
export default async function TopicExpertsPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("id", topicId)
    .maybeSingle<Topic>();
  if (!topic) notFound();

  const { data } = await supabase
    .from("experts")
    .select("*")
    .eq("topic_id", topicId)
    .order("created_at");
  const experts = (data ?? []) as Expert[];
  const mentor = experts.find((e) => e.kind === "mentor");
  const analyst = experts.find((e) => e.kind === "analyst");

  const boundAddMentor = addMentorExpert.bind(null, topicId);
  const boundAddAnalyst = addAnalystExpert.bind(null, topicId);

  return (
    <main className="px-5 pb-16 pt-6">
      <header className="mb-6 border-b border-rule pb-4">
        <Link
          href={`/topics/${topicId}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-faint hover:text-ink"
        >
          <LinkPending>
            <ChevronLeft className="size-4" aria-hidden />
          </LinkPending>{" "}
          {topic.title}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Experts</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Experts read each new report and add their own section below the
          briefing. An expert added mid-cycle can also review the current
          report — the button is on the briefing page.
        </p>
      </header>

      {mentor ? (
        <section
          aria-label="Mentor"
          className="rounded-md border border-rule"
        >
          <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-rule bg-neutral-50"
            >
              <Bot className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Mentor</p>
              <p className="text-xs text-ink-faint">
                Explains key concepts, entities, and relationships in each
                report. Remembers what you already know.
              </p>
            </div>
            <Badge tone={mentor.status === "active" ? "active" : "paused"}>
              {mentor.status}
            </Badge>
          </div>

          <div className="space-y-4 px-4 py-4">
            <form
              action={updateMentorSettings.bind(null, mentor.id)}
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
                  defaultValue={mentor.config.level ?? "basic"}
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
                  defaultValue={mentor.config.teaching_focus ?? "concepts"}
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

            <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
              <form action={toggleExpertStatus.bind(null, mentor.id)}>
                <SubmitButton
                  variant="outline"
                  pendingLabel={
                    mentor.status === "active" ? "Pausing…" : "Resuming…"
                  }
                >
                  {mentor.status === "active" ? "Pause Mentor" : "Resume Mentor"}
                </SubmitButton>
              </form>
              <form action={deleteExpert.bind(null, mentor.id)}>
                <SubmitButton
                  variant="danger"
                  pendingLabel="Removing…"
                  confirm="Remove Mentor? What it remembers teaching you for this topic will be deleted too."
                >
                  Remove Mentor
                </SubmitButton>
              </form>
            </div>
            <p className="text-xs text-ink-faint">
              {mentor.status === "active"
                ? "Removing Mentor also deletes what it remembers teaching you for this topic."
                : "While paused, Mentor skips new reports and its section is hidden from the briefing."}
            </p>
            <Link
              href={`/topics/${topicId}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink hover:underline"
            >
              See Mentor on the briefing{" "}
              <LinkPending>
                <ArrowRight className="size-3.5" aria-hidden />
              </LinkPending>
            </Link>
          </div>
        </section>
      ) : (
        <section aria-label="Add Mentor" className="rounded-md border border-rule">
          <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-rule bg-neutral-50"
            >
              <Bot className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold">Mentor</p>
              <p className="text-xs text-ink-faint">
                “Did you know” tips that build your understanding of this
                topic over time.
              </p>
            </div>
          </div>
          <form action={boundAddMentor} className="space-y-3 px-4 py-4">
            <Field
              label="Teaching level"
              htmlFor="level"
              hint="You can change this anytime."
            >
              <Select id="level" name="level" defaultValue="basic">
                {LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Teaching focus"
              htmlFor="add_teaching_focus"
              hint="“People & organisations” highlights relationships between mentioned entities and fact-checks them with a web search."
            >
              <Select
                id="add_teaching_focus"
                name="teaching_focus"
                defaultValue="concepts"
              >
                {FOCUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton pendingLabel="Adding Mentor…">
              Add Mentor to this topic
            </SubmitButton>
            <p className="text-xs text-ink-faint">
              Mentor reviews each new report automatically. To have it review
              the current report right away, use the button under the briefing
              after adding.
            </p>
          </form>
        </section>
      )}

      {analyst ? (
        <section aria-label="Analyst" className="mt-6 rounded-md border border-rule">
          <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-rule bg-neutral-50"
            >
              <Landmark className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{analyst.name}</p>
              <p className="text-xs text-ink-faint">
                An independent read of each report through your chosen lens —
                short commentary that refines or challenges the briefing.
              </p>
            </div>
            <Badge tone={analyst.status === "active" ? "active" : "paused"}>
              {analyst.status}
            </Badge>
          </div>

          <div className="space-y-4 px-4 py-4">
            <form
              action={updateAnalystSettings.bind(null, analyst.id)}
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
                  defaultValue={analyst.name}
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
                  defaultValue={analyst.config.focus ?? ""}
                  placeholder={"e.g. Malaysia's domestic politics, governance, power dynamics, and society\n\n## Use language such as\n- increases bargaining leverage\n- alters incentive structure"}
                />
              </Field>
              <SubmitButton variant="outline" pendingLabel="Saving…">
                Save analyst
              </SubmitButton>
              {analyst.config.focus?.trim() && (
                <div className="rounded-md border border-rule bg-neutral-50 px-4 py-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-ink-faint">
                    Saved specialization, as the analyst reads it
                  </p>
                  <Markdown text={analyst.config.focus} />
                </div>
              )}
            </form>

            <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
              <form action={toggleExpertStatus.bind(null, analyst.id)}>
                <SubmitButton
                  variant="outline"
                  pendingLabel={
                    analyst.status === "active" ? "Pausing…" : "Resuming…"
                  }
                >
                  {analyst.status === "active" ? "Pause" : "Resume"}{" "}
                  {analyst.name}
                </SubmitButton>
              </form>
              <form action={deleteExpert.bind(null, analyst.id)}>
                <SubmitButton
                  variant="danger"
                  pendingLabel="Removing…"
                  confirm={`Remove ${analyst.name}? Its commentary on this topic's reports will be deleted too.`}
                >
                  Remove {analyst.name}
                </SubmitButton>
              </form>
            </div>
            <p className="text-xs text-ink-faint">
              {analyst.status === "active"
                ? `Removing ${analyst.name} also deletes its commentary on this topic's reports.`
                : `While paused, ${analyst.name} skips new reports and its section is hidden from the briefing.`}
            </p>
            <Link
              href={`/topics/${topicId}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink hover:underline"
            >
              See {analyst.name} on the briefing{" "}
              <LinkPending>
                <ArrowRight className="size-3.5" aria-hidden />
              </LinkPending>
            </Link>
          </div>
        </section>
      ) : (
        <section
          aria-label="Add Analyst"
          className="mt-6 rounded-md border border-rule"
        >
          <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-rule bg-neutral-50"
            >
              <Landmark className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold">Analyst</p>
              <p className="text-xs text-ink-faint">
                An independent commentator on each report. Give it a
                specialization and it reads the briefing through that lens,
                adding what the report itself did not say.
              </p>
            </div>
          </div>
          <form action={boundAddAnalyst} className="space-y-3 px-4 py-4">
            <Field
              label="Name"
              htmlFor="add_analyst_name"
              hint="Optional — defaults to “Analyst”. You can change this anytime."
            >
              <Input
                id="add_analyst_name"
                name="name"
                maxLength={60}
                placeholder="e.g. Prof. James Chin"
              />
            </Field>
            <Field
              label="Specialization"
              htmlFor="analyst_focus"
              hint="Optional — defaults to the topic itself. Markdown works, and you can change this anytime."
            >
              <MarkdownTextarea
                id="analyst_focus"
                name="focus"
                rows={4}
                placeholder="e.g. Malaysia's domestic politics, governance, power dynamics, and society"
              />
            </Field>
            <SubmitButton pendingLabel="Adding Analyst…">
              Add Analyst to this topic
            </SubmitButton>
            <p className="text-xs text-ink-faint">
              The Analyst reviews each new report automatically. To have it
              review the current report right away, use the button under the
              briefing after adding.
            </p>
          </form>
        </section>
      )}

      <p className="mt-6 text-xs leading-relaxed text-ink-faint">
        Each expert run is a separate model call — its token cost is shown
        under the expert&apos;s section on the briefing. More expert kinds are
        coming.
      </p>
    </main>
  );
}
