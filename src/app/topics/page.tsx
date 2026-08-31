import Link from "next/link";
import { redirect } from "next/navigation";
import { Newspaper } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { DriveCopyButton } from "@/components/drive-copy-button";
import { LinkPending } from "@/components/link-pending";
import { Badge } from "@/components/ui";
import { buildDriveScript } from "@/lib/actions";
import { stripEntityMarkers } from "@/lib/entities";
import { formatDateTime } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HeroImage, QuestionVerdict, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** What the home list needs from a topic's latest ready report. */
interface HomeReportRow {
  summary: string | null;
  created_at: string;
  /** JSON-path picks, so the row stays light — never the whole sections blob. */
  hero_image: HeroImage | null;
  verdict: QuestionVerdict | null;
}

type HomeTopic = Pick<Topic, "id" | "title" | "watch_mode" | "status">;

/**
 * The one-liner under each topic: question topics show their current answer;
 * the rest show the report's one-sentence summary (written for every mode).
 */
function topicOneLiner(topic: HomeTopic, report: HomeReportRow | null): string {
  if (!report) return "No report yet — open the topic to generate one.";
  if (topic.watch_mode === "question" && report.verdict?.answer) {
    return stripEntityMarkers(report.verdict.answer);
  }
  return report.summary
    ? stripEntityMarkers(report.summary)
    : "Report ready — open the topic to read it.";
}

/** Home — every topic at a glance: thumbnail, title, current one-liner. */
export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: topicRows } = await supabase
    .from("topics")
    .select("id, title, watch_mode, status")
    .order("position")
    .order("created_at");
  const topics = (topicRows ?? []) as HomeTopic[];
  if (topics.length === 0) redirect("/onboarding");

  // One light query per topic, all in parallel — summary plus two JSON-path
  // picks from sections; never the full sections (or trace) payload.
  const latest = await Promise.all(
    topics.map((topic) =>
      supabase
        .from("reports")
        .select("summary, created_at, sections->hero_image, sections->verdict")
        .eq("topic_id", topic.id)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<HomeReportRow>()
        .then(({ data }) => data),
    ),
  );

  return (
    <main className="px-5 pb-28 pt-6">
      <header className="mb-6 border-b border-rule pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Your topics</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Everything Proactive is watching for you, at a glance.
        </p>
      </header>

      {/* Home actions, first of more to come. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <DriveCopyButton
          topics={topics.map((topic, i) => ({
            id: topic.id,
            title: topic.title,
            hasReport: latest[i] != null,
          }))}
          buildScript={buildDriveScript}
        />
      </div>

      <ul className="divide-y divide-rule">
        {topics.map((topic, i) => {
          const report = latest[i] ?? null;
          return (
            <li key={topic.id}>
              <Link
                href={`/topics/${topic.id}`}
                className="flex items-center gap-4 py-4 transition-colors hover:bg-neutral-50"
              >
                {report?.hero_image?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={report.hero_image.url}
                    alt=""
                    loading="lazy"
                    className="size-20 shrink-0 rounded-lg border border-rule bg-neutral-50 object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-rule bg-neutral-50"
                  >
                    <Newspaper className="size-7 text-ink-faint" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-base font-bold">
                      {topic.title}
                    </span>
                    {topic.status === "paused" && (
                      <Badge tone="paused">paused</Badge>
                    )}
                    <LinkPending className="size-3.5 shrink-0 text-ink-faint" />
                  </p>
                  {report && (
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {formatDateTime(report.created_at)}
                    </p>
                  )}
                  <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-soft">
                    {topicOneLiner(topic, report)}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <BottomNav
        topics={topics.map(({ id, title }) => ({ id, title }))}
        currentId=""
      />
    </main>
  );
}
