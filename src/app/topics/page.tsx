import Link from "next/link";
import { redirect } from "next/navigation";
import { Newspaper, Plus, User } from "lucide-react";
import { BottomNav, type NavTopic } from "@/components/bottom-nav";
import { DriveCopyButton } from "@/components/drive-copy-button";
import { LinkPending } from "@/components/link-pending";
import { Badge } from "@/components/ui";
import { buildDriveScript } from "@/lib/actions";
import { stripEntityMarkers } from "@/lib/entities";
import { formatDateTime } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isTopicUnread } from "@/lib/types";
import type { HeroImage, Profile, QuestionVerdict, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** What the home list needs from a topic's latest ready report. */
interface HomeReportRow {
  summary: string | null;
  created_at: string;
  /** JSON-path picks, so the row stays light — never the whole sections blob. */
  hero_image: HeroImage | null;
  verdict: QuestionVerdict | null;
}

type HomeTopic = Pick<
  Topic,
  | "id"
  | "title"
  | "watch_mode"
  | "status"
  | "last_generated_at"
  | "last_read_at"
>;

/** One row of the home list: a topic, its latest report, and its read state. */
interface HomeEntry {
  topic: HomeTopic;
  report: HomeReportRow | null;
  unread: boolean;
}

/** Sort key for the unread segment — newest report first. */
const updatedMs = (topic: HomeTopic) =>
  topic.last_generated_at ? new Date(topic.last_generated_at).getTime() : 0;

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

  // Both key on the authenticated user, so they fan out together.
  const [{ data: topicRows }, { data: profile }] = await Promise.all([
    supabase
      .from("topics")
      .select("id, title, watch_mode, status, last_generated_at, last_read_at")
      .order("position")
      .order("created_at"),
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "display_name" | "avatar_url">>(),
  ]);
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

  // The same shape the briefing page hands the switcher, so the bar segments
  // into "New reports" / "Read reports" here too rather than a flat list.
  const navBarTopics: NavTopic[] = topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    unread: isTopicUnread(topic),
    updatedAt: topic.last_generated_at,
  }));

  // Pair each topic with its report before splitting, so the two stay together
  // once the order changes.
  const entries: HomeEntry[] = topics.map((topic, i) => ({
    topic,
    report: latest[i] ?? null,
    unread: isTopicUnread(topic),
  }));
  // Same split and ordering as the switcher: unread first, newest at the top,
  // the rest in the user's own arrangement.
  const unread = entries
    .filter((e) => e.unread)
    .sort((a, b) => updatedMs(b.topic) - updatedMs(a.topic));
  const read = entries.filter((e) => !e.unread);
  // Headings only earn their space once something is unread; with nothing new
  // the page is just the list.
  const segments =
    unread.length > 0
      ? [
          { heading: "New reports", entries: unread },
          { heading: "Read reports", entries: read },
        ]
      : [{ heading: null, entries: read }];

  return (
    <main className="px-5 pb-28 pt-6">
      <header className="mb-6 flex items-start justify-between gap-4 border-b border-rule pb-4">
        <div className="min-w-0">
          {/* Wordmark: home is the app's front door, so it says whose it is.
              Wider tracking than the segment headings, which share the small
              uppercase treatment but label sections rather than the product. */}
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
            Proactive
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Your topics</h1>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            Everything Proactive is watching for you, at a glance.
          </p>
        </div>
        <ProfileAvatar profile={profile ?? null} />
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
        <Link
          href="/topics/new"
          aria-label="Add a new topic"
          title="Add a new topic"
          className="inline-flex size-11 items-center justify-center rounded-md border border-rule hover:bg-neutral-100"
        >
          <LinkPending>
            <Plus className="size-5" aria-hidden />
          </LinkPending>
        </Link>
      </div>

      {segments.map((segment, i) => (
        <section key={segment.heading ?? "all"} className={i > 0 ? "mt-6" : ""}>
          {segment.heading && (
            <h2 className="pb-1 text-[11px] uppercase tracking-wide text-ink-faint">
              {segment.heading}
            </h2>
          )}
          <ul className="divide-y divide-rule">
            {segment.entries.map((entry) => (
              <TopicRow key={entry.topic.id} entry={entry} />
            ))}
          </ul>
        </section>
      ))}

      {/* Home reads no briefing, so nothing is marked read here — every
          unread topic stays in the switcher's "New reports" segment. */}
      <BottomNav topics={navBarTopics} currentId="" />
    </main>
  );
}

/**
 * The signed-in user's picture, linking to settings. Google supplies it at
 * signup; when it's missing (or the URL later 404s) the initial stands in, so
 * the corner never renders as a broken image.
 */
function ProfileAvatar({
  profile,
}: {
  profile: Pick<Profile, "display_name" | "avatar_url"> | null;
}) {
  const name = profile?.display_name?.trim() || "";
  const initial = name.charAt(0).toUpperCase();
  return (
    <Link
      href="/settings"
      aria-label={name ? `Settings — signed in as ${name}` : "Settings"}
      title={name || "Settings"}
      className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
    >
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt=""
          referrerPolicy="no-referrer"
          className="size-10 rounded-full border border-rule bg-neutral-50 object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full border border-rule bg-neutral-50 text-sm font-bold text-ink-faint"
        >
          {initial || <User className="size-5" aria-hidden />}
        </span>
      )}
    </Link>
  );
}

/** One topic in the home list: thumbnail, title, and its current one-liner. */
function TopicRow({ entry }: { entry: HomeEntry }) {
  const { topic, report, unread } = entry;
  return (
    <li>
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
            {/* The same dot the switcher uses, so a row scrolled away from its
                heading still reads as new. */}
            {unread && (
              <span
                aria-label="Unread report"
                className="size-1.5 shrink-0 rounded-full bg-emerald-600"
              />
            )}
            {topic.status === "paused" && <Badge tone="paused">paused</Badge>}
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
}
