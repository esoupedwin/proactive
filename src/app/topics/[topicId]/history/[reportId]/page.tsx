import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ReportView } from "@/components/report-view";
import { SourcesDrawer } from "@/components/sources-drawer";
import { formatDateTime } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Report, Source, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** A single archived report. */
export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ topicId: string; reportId: string }>;
}) {
  const { topicId, reportId } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: topic }, { data: report }] = await Promise.all([
    supabase.from("topics").select("*").eq("id", topicId).maybeSingle<Topic>(),
    supabase
      .from("reports")
      .select("*")
      .eq("id", reportId)
      .eq("topic_id", topicId)
      .maybeSingle<Report>(),
  ]);
  if (!topic || !report || !report.sections) notFound();

  const { data } = await supabase
    .from("sources")
    .select("*")
    .eq("report_id", report.id)
    .order("created_at");
  const sources = (data ?? []) as Source[];

  return (
    <main className="px-5 pb-16 pt-6">
      <header className="mb-5 border-b border-rule pb-4">
        <Link
          href={`/topics/${topicId}/history`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-faint hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden /> History
        </Link>
        <h1 className="text-2xl font-bold leading-tight tracking-tight">
          {topic.title}
        </h1>
        <p className="mt-1 text-xs text-ink-faint">
          Fetched {formatDateTime(report.created_at)}
        </p>
      </header>

      <ReportView sections={report.sections} sources={sources} />

      <div className="mt-8 border-t border-rule pt-5">
        <SourcesDrawer sources={sources} />
      </div>
    </main>
  );
}
