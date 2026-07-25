import Link from "next/link";
import { notFound } from "next/navigation";
import { History, Pencil } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { GenerateButton } from "@/components/generate-button";
import { GenerationWatcher } from "@/components/generation-watcher";
import { ReportView } from "@/components/report-view";
import { SourcesDrawer } from "@/components/sources-drawer";
import { Badge } from "@/components/ui";
import {
  formatDateTime,
  formatUsageSummary,
  isGenerationLocked,
} from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Report, Source, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Topic briefing — the main screen: one topic's latest report. */
export default async function TopicBriefingPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("id", topicId)
    .maybeSingle<Topic>();
  if (!topic) notFound();

  // Remember for the post-login redirect.
  await supabase
    .from("profiles")
    .update({ last_viewed_topic_id: topic.id })
    .eq("id", user.id);

  const [{ data: navTopics }, { data: latestReports }] = await Promise.all([
    supabase
      .from("topics")
      .select("id, title")
      .order("position")
      .order("created_at"),
    supabase
      .from("reports")
      .select("*")
      .eq("topic_id", topic.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const reports = (latestReports ?? []) as Report[];
  const readyReport = reports.find((r) => r.status === "ready") ?? null;
  const newest = reports[0] ?? null;
  const generating =
    newest?.status === "generating" && isGenerationLocked(newest);
  const failed = newest?.status === "error" ? newest : null;

  let sources: Source[] = [];
  if (readyReport) {
    const { data } = await supabase
      .from("sources")
      .select("*")
      .eq("report_id", readyReport.id)
      .order("created_at");
    sources = (data ?? []) as Source[];
  }

  return (
    <main className="px-5 pb-28 pt-6">
      <header className="mb-5 border-b border-rule pb-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">
            {topic.title}
          </h1>
          <Badge tone={topic.status === "active" ? "active" : "paused"}>
            {topic.status}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          {readyReport
            ? [
                `Fetched ${formatDateTime(readyReport.created_at)}`,
                formatUsageSummary(readyReport.usage),
              ]
                .filter(Boolean)
                .join(" · ")
            : "No report yet"}
        </p>
      </header>

      {generating && newest && (
        <GenerationWatcher reportId={newest.id} startedAt={newest.created_at} />
      )}

      {failed && (
        <p
          role="alert"
          className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          The last update attempt failed
          {failed.error ? `: ${failed.error}` : "."} You can try again below.
        </p>
      )}

      {readyReport?.sections ? (
        <ReportView sections={readyReport.sections} sources={sources} />
      ) : (
        !generating && (
          <div className="rounded-md border border-rule bg-neutral-50 px-4 py-8 text-center">
            <p className="text-sm font-medium">No report yet.</p>
            <p className="mt-1 text-sm text-ink-faint">
              Generate your first update to get a briefing on this topic.
            </p>
          </div>
        )
      )}

      <div className="mt-8 space-y-3 border-t border-rule pt-5">
        <GenerateButton topicId={topic.id} />
        <div className="flex flex-wrap items-center gap-2">
          <SourcesDrawer sources={sources} />
          <Link
            href={`/topics/${topic.id}/history`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rule px-4 text-sm font-medium hover:bg-neutral-100"
          >
            <History className="size-4" aria-hidden /> History
          </Link>
          <Link
            href={`/topics/${topic.id}/edit`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rule px-4 text-sm font-medium hover:bg-neutral-100"
          >
            <Pencil className="size-4" aria-hidden /> Edit
          </Link>
        </div>
      </div>

      <BottomNav topics={navTopics ?? []} currentId={topic.id} />
    </main>
  );
}
