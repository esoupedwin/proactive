import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { ReportView } from "@/components/report-view";
import { SourcesDrawer } from "@/components/sources-drawer";
import { keyEntitiesFromMemory } from "@/lib/entities";
import { formatDateTime } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Report, Source, Topic, TopicMemory } from "@/lib/types";

export const dynamic = "force-dynamic";

/** A single archived report. */
export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ topicId: string; reportId: string }>;
}) {
  const { topicId, reportId } = await params;
  const supabase = await createSupabaseServerClient();

  // Everything keys on the URL params, so it all fans out in one round trip.
  // Never select `*` from reports here — `trace` is huge and unrendered.
  const [{ data: topic }, { data: report }, { data }, { data: memory }] =
    await Promise.all([
      supabase
        .from("topics")
        .select("*")
        .eq("id", topicId)
        .maybeSingle<Topic>(),
      supabase
        .from("reports")
        .select("id, sections, created_at")
        .eq("id", reportId)
        .eq("topic_id", topicId)
        .maybeSingle<Pick<Report, "id" | "sections" | "created_at">>(),
      supabase
        .from("sources")
        .select("*")
        .eq("report_id", reportId)
        .order("created_at"),
      supabase
        .from("topic_memory")
        .select("facts")
        .eq("topic_id", topicId)
        .maybeSingle<Pick<TopicMemory, "facts">>(),
    ]);
  if (!topic || !report || !report.sections) notFound();

  const sources = (data ?? []) as Source[];
  const fallbackEntities = keyEntitiesFromMemory(memory?.facts ?? []);

  return (
    <main className="px-5 pb-16 pt-6">
      <header className="mb-5 border-b border-rule pb-4">
        <Link
          href={`/topics/${topicId}/history`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-faint hover:text-ink"
        >
          <LinkPending>
            <ChevronLeft className="size-4" aria-hidden />
          </LinkPending>{" "}
          History
        </Link>
        <h1 className="text-2xl font-bold leading-tight tracking-tight">
          {topic.title}
        </h1>
        <p className="mt-1 text-xs text-ink-faint">
          Fetched {formatDateTime(report.created_at)}
        </p>
      </header>

      <ReportView
        sections={report.sections}
        sources={sources}
        fallbackEntities={fallbackEntities}
        question={topic.analytical_question}
      />

      <div className="mt-8 border-t border-rule pt-5">
        <SourcesDrawer sources={sources} />
      </div>
    </main>
  );
}
