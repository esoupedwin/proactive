import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, Bot, Coins, History, Layers, Pencil } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { ExpertPanel, type ExpertPanelItem } from "@/components/expert-panel";
import { GenerateButton } from "@/components/generate-button";
import { GenerationWatcher } from "@/components/generation-watcher";
import { LinkPending } from "@/components/link-pending";
import { RelatedNewsButton } from "@/components/related-news-button";
import { ReportFeedback } from "@/components/report-feedback";
import { ReportView } from "@/components/report-view";
import { ScreenshotButton } from "@/components/screenshot-button";
import { SourcesDrawer } from "@/components/sources-drawer";
import { SpeechButton } from "@/components/speech-button";
import { buildSpeechScript } from "@/lib/speech";
import { Badge } from "@/components/ui";
import {
  formatDateTime,
  formatUsageSummary,
  isGenerationLocked,
} from "@/lib/reports";
import { keyEntitiesFromMemory } from "@/lib/entities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Expert,
  ExpertOutput,
  Report,
  ReportFeedback as ReportFeedbackRow,
  Source,
  Topic,
  TopicMemory,
} from "@/lib/types";

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
  let fallbackEntities: string[] = [];
  let expertItems: ExpertPanelItem[] = [];
  let feedback: Pick<ReportFeedbackRow, "rating" | "comment"> | null = null;
  if (readyReport) {
    const [
      { data },
      { data: memory },
      { data: expertRows },
      { data: outputRows },
      { data: feedbackRow },
    ] = await Promise.all([
        supabase
          .from("sources")
          .select("*")
          .eq("report_id", readyReport.id)
          .order("created_at"),
        supabase
          .from("topic_memory")
          .select("facts")
          .eq("topic_id", topic.id)
          .maybeSingle<Pick<TopicMemory, "facts">>(),
        supabase
          .from("experts")
          .select("*")
          .eq("topic_id", topic.id)
          .eq("status", "active")
          .order("created_at"),
        supabase
          .from("expert_outputs")
          .select("*")
          .eq("report_id", readyReport.id),
        supabase
          .from("report_feedback")
          .select("rating, comment")
          .eq("report_id", readyReport.id)
          .maybeSingle<Pick<ReportFeedbackRow, "rating" | "comment">>(),
      ]);
    sources = (data ?? []) as Source[];
    feedback = feedbackRow ?? null;
    fallbackEntities = keyEntitiesFromMemory(memory?.facts ?? []);

    const outputs = (outputRows ?? []) as ExpertOutput[];
    expertItems = ((expertRows ?? []) as Expert[]).map((expert) => ({
      expert,
      output: outputs.find((o) => o.expert_id === expert.id) ?? null,
    }));

    // Experts don't run on a "nothing changed" report, so don't offer to run
    // one. Outputs saved before that rule still show.
    if (readyReport.sections?.no_meaningful_change) {
      expertItems = expertItems.filter((item) => item.output !== null);
    }
  }

  // Built here rather than in the client so the whole briefing — including
  // every expert's output — is in the script without a second round trip.
  const speechScript = readyReport?.sections
    ? buildSpeechScript({
        topicTitle: topic.title,
        sections: readyReport.sections,
        reportDate: readyReport.created_at,
        experts: expertItems,
      })
    : null;

  const screenshotName = `${topic.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${(readyReport?.created_at ?? new Date().toISOString()).slice(0, 10)}.png`;

  return (
    <main className="pb-28">
      {/* Everything inside this wrapper is included in the screenshot. */}
      <div id="report-capture" className="px-5 pt-6">
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

      {/* Primary actions, kept within thumb reach at the top of the briefing.
          data-no-capture so they stay out of the screenshot. */}
      <div data-no-capture className="mb-5 flex flex-wrap items-center gap-2">
        <GenerateButton topicId={topic.id} compact />
        {speechScript && <SpeechButton script={speechScript} />}
        <RelatedNewsButton topicId={topic.id} />
        <Link
          href={`/topics/${topic.id}/extracts`}
          aria-label="View all extracts for this topic"
          title="View all extracts for this topic"
          className="inline-flex size-11 items-center justify-center rounded-md border border-rule hover:bg-neutral-100"
        >
          <LinkPending>
            <Layers className="size-5" aria-hidden />
          </LinkPending>
        </Link>
      </div>

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
        <>
          <ReportView
            sections={readyReport.sections}
            sources={sources}
            fallbackEntities={fallbackEntities}
          />
          <ExpertPanel items={expertItems} reportId={readyReport.id} />
          <ReportFeedback
            reportId={readyReport.id}
            initialRating={feedback?.rating ?? null}
            initialComment={feedback?.comment ?? null}
          />
        </>
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

      {/* Generate now lives in the action row under the title. */}
      <div className="mt-8 space-y-3 border-t border-rule pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <SourcesDrawer sources={sources} />
          <Link
            href={`/topics/${topic.id}/history`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rule px-4 text-sm font-medium hover:bg-neutral-100"
          >
            <LinkPending>
              <History className="size-4" aria-hidden />
            </LinkPending>{" "}
            History
          </Link>
          <Link
            href={`/topics/${topic.id}/extracts`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rule px-4 text-sm font-medium hover:bg-neutral-100"
          >
            <LinkPending>
              <Layers className="size-4" aria-hidden />
            </LinkPending>{" "}
            Extracts
          </Link>
          <Link
            href={`/topics/${topic.id}/edit`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rule px-4 text-sm font-medium hover:bg-neutral-100"
          >
            <LinkPending>
              <Pencil className="size-4" aria-hidden />
            </LinkPending>{" "}
            Edit
          </Link>
          <Link
            href={`/topics/${topic.id}/prompts`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rule px-4 text-sm font-medium hover:bg-neutral-100"
          >
            <LinkPending>
              <Activity className="size-4" aria-hidden />
            </LinkPending>{" "}
            Activity
          </Link>
          <Link
            href={`/topics/${topic.id}/experts`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rule px-4 text-sm font-medium hover:bg-neutral-100"
          >
            <LinkPending>
              <Bot className="size-4" aria-hidden />
            </LinkPending>{" "}
            Experts
          </Link>
          <Link
            href={`/topics/${topic.id}/usage`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rule px-4 text-sm font-medium hover:bg-neutral-100"
          >
            <LinkPending>
              <Coins className="size-4" aria-hidden />
            </LinkPending>{" "}
            Tokens
          </Link>
          <ScreenshotButton
            targetId="report-capture"
            filename={screenshotName}
          />
        </div>
      </div>
      </div>

      <BottomNav topics={navTopics ?? []} currentId={topic.id} />
    </main>
  );
}
