import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { Badge } from "@/components/ui";
import { formatDateTime, formatUsageSummary } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Report, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Report history — newest to oldest. */
export default async function ReportHistoryPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const supabase = await createSupabaseServerClient();

  // One round trip; the list needs only the summary line per report — never
  // `sections` or the megabyte-scale `trace`.
  const [{ data: topic }, { data }] = await Promise.all([
    supabase.from("topics").select("*").eq("id", topicId).maybeSingle<Topic>(),
    supabase
      .from("reports")
      .select("id, status, summary, usage, error, created_at")
      .eq("topic_id", topicId)
      .neq("status", "generating")
      .order("created_at", { ascending: false }),
  ]);
  if (!topic) notFound();
  const reports = (data ?? []) as Pick<
    Report,
    "id" | "status" | "summary" | "usage" | "error" | "created_at"
  >[];

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
        <h1 className="text-2xl font-bold tracking-tight">Report history</h1>
      </header>

      {reports.length === 0 ? (
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-8 text-center text-sm text-ink-faint">
          No reports yet. Generate your first update from the topic screen.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {reports.map((report) => (
            <li key={report.id} className="py-4">
              {report.status === "ready" ? (
                <Link
                  href={`/topics/${topicId}/history/${report.id}`}
                  className="block hover:opacity-70"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {formatDateTime(report.created_at)}
                    {formatUsageSummary(report.usage) && (
                      <span className="font-normal text-ink-faint">
                        {formatUsageSummary(report.usage)}
                      </span>
                    )}
                    <LinkPending className="size-3.5 text-ink-faint" />
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                    {report.summary ?? "Report"}
                  </p>
                </Link>
              ) : (
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink-faint">
                    {formatDateTime(report.created_at)}
                    <Badge tone="paused">failed</Badge>
                  </p>
                  {report.error && (
                    <p className="mt-1 text-xs text-ink-faint">{report.error}</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
