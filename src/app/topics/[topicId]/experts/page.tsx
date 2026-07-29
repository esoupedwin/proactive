import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, ChevronLeft, Landmark } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { Badge, Button, Field, Select, Textarea } from "@/components/ui";
import {
  addAnalystExpert,
  addMentorExpert,
  deleteExpert,
  toggleExpertStatus,
  updateExpertFocus,
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
          Experts read each generated report and add their own output below
          it.
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
              <Button type="submit" variant="outline">
                Save teaching settings
              </Button>
            </form>

            <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
              <form action={toggleExpertStatus.bind(null, mentor.id)}>
                <Button type="submit" variant="outline">
                  {mentor.status === "active" ? "Pause Mentor" : "Resume Mentor"}
                </Button>
              </form>
              <form action={deleteExpert.bind(null, mentor.id)}>
                <Button type="submit" variant="danger">
                  Remove Mentor
                </Button>
              </form>
            </div>
            <p className="text-xs text-ink-faint">
              Removing Mentor also deletes what it remembers teaching you for
              this topic.
            </p>
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
            <Button type="submit">Add Mentor to this topic</Button>
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
              <p className="text-sm font-bold">Analyst</p>
              <p className="text-xs text-ink-faint">
                Neutral, evidence-based analysis: what&apos;s happening, why it
                matters, what may happen next. Tracks its own forward calls.
              </p>
            </div>
            <Badge tone={analyst.status === "active" ? "active" : "paused"}>
              {analyst.status}
            </Badge>
          </div>

          <div className="space-y-4 px-4 py-4">
            <form
              action={updateExpertFocus.bind(null, analyst.id)}
              className="space-y-3"
            >
              <Field
                label="Specialization"
                htmlFor="focus"
                hint="What the analyst focuses on. Leave empty to analyze the topic broadly."
              >
                <Textarea
                  id="focus"
                  name="focus"
                  rows={3}
                  defaultValue={analyst.config.focus ?? ""}
                  placeholder="e.g. Malaysia's domestic politics, governance, power dynamics, and society"
                />
              </Field>
              <Button type="submit" variant="outline">
                Save specialization
              </Button>
            </form>

            <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
              <form action={toggleExpertStatus.bind(null, analyst.id)}>
                <Button type="submit" variant="outline">
                  {analyst.status === "active" ? "Pause Analyst" : "Resume Analyst"}
                </Button>
              </form>
              <form action={deleteExpert.bind(null, analyst.id)}>
                <Button type="submit" variant="danger">
                  Remove Analyst
                </Button>
              </form>
            </div>
            <p className="text-xs text-ink-faint">
              Removing Analyst also deletes its tracked scenarios for this
              topic.
            </p>
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
                Neutral, evidence-based analysis of each report: what&apos;s
                happening, why it matters, what may happen next — with forward
                scenarios it revisits over time.
              </p>
            </div>
          </div>
          <form action={boundAddAnalyst} className="space-y-3 px-4 py-4">
            <Field
              label="Specialization"
              htmlFor="analyst_focus"
              hint="Optional — defaults to the topic itself. You can change this anytime."
            >
              <Textarea
                id="analyst_focus"
                name="focus"
                rows={3}
                placeholder="e.g. Malaysia's domestic politics, governance, power dynamics, and society"
              />
            </Field>
            <Button type="submit">Add Analyst to this topic</Button>
          </form>
        </section>
      )}

      <p className="mt-6 text-xs leading-relaxed text-ink-faint">
        Experts read each generated report and contribute their own section
        below it. More kinds are coming.
      </p>
    </main>
  );
}
