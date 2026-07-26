import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { Badge } from "@/components/ui";
import { formatDateTime, formatTokens } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Report, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Friendly names for the pipeline stages (structured-output schema names). */
const STAGE_LABEL: Record<string, string> = {
  search_plan: "Topic planner — build search queries",
  followup_queries: "Follow-up planner — target queries from news findings",
  seek_result: "Information seeker — web search",
  extraction_result: "Extractor — structure the found sources",
  report_draft: "Update reporter — write the briefing",
  memory_update: "Memory updater — fold report into topic memory",
};

/** The OpenAI prompt flow behind the topic's latest report. */
export default async function PromptsPage({
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

  const { data: report } = await supabase
    .from("reports")
    .select("id, created_at, status, trace")
    .eq("topic_id", topicId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<Report, "id" | "created_at" | "status" | "trace">>();

  const calls = report?.trace?.calls ?? [];

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
        <h1 className="text-2xl font-bold tracking-tight">Prompt flow</h1>
        <p className="mt-1 text-xs text-ink-faint">
          {report
            ? `Every OpenAI call behind the report of ${formatDateTime(report.created_at)}, in order.`
            : "No report yet."}
        </p>
      </header>

      {calls.length === 0 ? (
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-8 text-center text-sm text-ink-faint">
          No prompt trace recorded for the latest report. Traces are captured
          for reports generated from now on — generate a new update to see the
          flow here.
        </p>
      ) : (
        <ol className="space-y-4">
          {calls.map((call) => (
            <li
              key={call.index}
              className="rounded-md border border-rule bg-paper"
            >
              <div className="border-b border-rule px-4 py-3">
                <p className="text-sm font-semibold leading-snug">
                  {call.index}. {STAGE_LABEL[call.stage] ?? call.stage}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge>{call.model}</Badge>
                  <Badge>{call.tier} tier</Badge>
                  {call.used_web_search && (
                    <Badge tone="active">
                      {call.web_search_calls} web search
                      {call.web_search_calls === 1 ? "" : "es"}
                    </Badge>
                  )}
                  {call.error && <Badge tone="paused">failed</Badge>}
                </div>
                <p className="mt-1.5 text-xs text-ink-faint">
                  {(call.duration_ms / 1000).toFixed(1)}s ·{" "}
                  {formatTokens(call.input_tokens)} in /{" "}
                  {formatTokens(call.output_tokens)} out
                </p>
                {call.error && (
                  <p className="mt-1 text-xs text-red-700">{call.error}</p>
                )}
              </div>

              <details className="border-b border-rule">
                <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft hover:bg-neutral-50">
                  Instructions (system prompt)
                </summary>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-rule bg-neutral-50 px-4 py-3 font-mono text-xs leading-relaxed">
                  {call.instructions}
                </pre>
              </details>

              <details>
                <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft hover:bg-neutral-50">
                  Input (task content)
                </summary>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-rule bg-neutral-50 px-4 py-3 font-mono text-xs leading-relaxed">
                  {call.input}
                </pre>
              </details>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
