import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Bot,
  ChevronLeft,
  Landmark,
  MessagesSquare,
  Plus,
  Users,
} from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Expert, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The experts attached to a topic, as a card grid; tap a card to manage. */
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

      <Link
        href={`/topics/${topicId}/experts/new`}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-base font-semibold text-paper hover:bg-ink-soft"
      >
        <LinkPending>
          <Plus className="size-5" aria-hidden />
        </LinkPending>{" "}
        Add New Expert
      </Link>

      {experts.length === 0 ? (
        <p className="mt-6 rounded-md border border-rule bg-neutral-50 px-4 py-8 text-center text-sm text-ink-faint">
          No experts yet. Add a Mentor to build your understanding, an Analyst
          for an independent read of each report, or a Sentiment reader for
          the public mood on Reddit.
        </p>
      ) : (
        <ul className="mt-6 grid auto-rows-fr grid-cols-2 gap-4">
          {experts.map((expert) => (
            <ExpertTile key={expert.id} expert={expert} topicId={topicId} />
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs leading-relaxed text-ink-faint">
        Each expert run is a separate model call — its token cost is shown
        under the expert&apos;s section on the briefing. More expert kinds are
        coming.
      </p>
    </main>
  );
}

const KIND_TITLE: Record<Expert["kind"], string> = {
  mentor: "Mentor",
  analyst: "Analyst",
  sentiment: "Sentiment",
  personality: "Personality",
};

const KIND_ICON: Record<Expert["kind"], React.ReactNode> = {
  mentor: <Bot className="size-5" />,
  analyst: <Landmark className="size-5" />,
  sentiment: <MessagesSquare className="size-5" />,
  personality: <Users className="size-5" />,
};

/** One expert as a tappable summary card. */
function ExpertTile({ expert, topicId }: { expert: Expert; topicId: string }) {
  const isAnalyst = expert.kind === "analyst";
  const active = expert.status === "active";
  return (
    <li>
      <Link
        href={`/topics/${topicId}/experts/${expert.id}`}
        aria-label={`${expert.name} — manage`}
        className="flex h-full flex-col rounded-lg border border-rule p-4 transition-colors hover:bg-neutral-50"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={
                active
                  ? "text-xs font-bold uppercase tracking-wide text-emerald-700"
                  : "text-xs font-bold uppercase tracking-wide text-ink-faint"
              }
            >
              {active ? "Active" : "Paused"}
            </p>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight">
              {KIND_TITLE[expert.kind]}
            </h2>
          </div>
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-rule bg-neutral-50"
          >
            {KIND_ICON[expert.kind]}
          </span>
        </div>

        {isAnalyst ? (
          <>
            {expert.name !== "Analyst" && (
              <p className="mt-3 truncate text-sm font-semibold">
                {expert.name}
              </p>
            )}
            <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-ink-faint">
              {expert.config.focus?.trim()
                ? `Specialization: ${expert.config.focus}`
                : "Analyzes the topic broadly through an independent lens."}
            </p>
          </>
        ) : expert.kind === "sentiment" ? (
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            Searches Reddit for public reaction to each report&apos;s main
            points and reads the prevailing mood.
          </p>
        ) : expert.kind === "personality" ? (
          <>
            {expert.name !== "Personality" && (
              <p className="mt-3 truncate text-sm font-semibold">
                {expert.name}
              </p>
            )}
            <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-ink-faint">
              {expert.config.personality_mode === "profiles"
                ? "Profiles the people mentioned in each report — who they are and why they matter."
                : expert.config.issue?.trim()
                  ? `Tracks key players' stances on: ${expert.config.issue}`
                  : "Tracks key players' stances on the topic's own question over time."}
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              “Did you know” tips that build your understanding of this topic
              over time.
            </p>
            <p className="mt-2 text-sm font-medium capitalize">
              {(expert.config.level ?? "basic") + " level"}
            </p>
          </>
        )}
      </Link>
    </li>
  );
}
