import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CallList } from "@/components/call-list";
import { LinkPending } from "@/components/link-pending";
import { PromptFlowTabs } from "@/components/prompt-flow-tabs";
import { formatDateTime } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LlmCallTrace, Report, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Tracker tool stages, for traces recorded before the agent field existed. */
const TRACKER_STAGES = new Set([
  "tool:exa_search",
  "tool:search_existing_extracts",
  "tool:record_extract",
  "tool:corroborate_extract",
]);

/** Inline "Searched: …" line for Exa tool calls (query lives in the args JSON). */
function exaQuery(call: LlmCallTrace): string | null {
  if (call.stage !== "tool:exa_search") return null;
  try {
    const args = JSON.parse(call.input) as { query?: string };
    return args.query ? `Searched: "${args.query}"` : null;
  } catch {
    return null;
  }
}

function isTrackerCall(call: LlmCallTrace): boolean {
  if (call.agent) return call.agent === "info-tracker";
  return (
    call.stage.startsWith("agent_turn:info-tracker") ||
    TRACKER_STAGES.has(call.stage)
  );
}


/** Everything the agents did behind the topic's latest report, split by agent. */
export default async function AgentActivityPage({
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
  const trackerCalls = calls.filter(isTrackerCall);
  // Reporter tab also carries expert calls (they run as part of reporting)
  // and any legacy-pipeline stages.
  const reporterCalls = calls.filter((c) => !isTrackerCall(c));

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
        <h1 className="text-2xl font-bold tracking-tight">Agent activity</h1>
        <p className="mt-1 text-xs text-ink-faint">
          {report
            ? `Every model call, tool call, and search behind the report of ${formatDateTime(report.created_at)}, in order, per agent.`
            : "No report yet."}
        </p>
      </header>

      {calls.length === 0 ? (
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-8 text-center text-sm text-ink-faint">
          No activity trace recorded for the latest report. Traces are
          captured for reports generated from now on — generate a new update
          to see the activity here.
        </p>
      ) : (
        <PromptFlowTabs
          tabs={[
            {
              key: "tracker",
              label: "Info Tracker",
              count: trackerCalls.length,
              content: (
                <CallList
                  calls={trackerCalls}
                  emptyMessage="The Info Tracker didn't run inside this generation — it had run recently on its own schedule, so the Reporter worked from already-collected extracts."
                />
              ),
            },
            {
              key: "reporter",
              label: "Reporter",
              count: reporterCalls.length,
              content: (
                <CallList
                  calls={reporterCalls}
                  emptyMessage="No Reporter calls recorded for this report."
                />
              ),
            },
          ]}
        />
      )}
    </main>
  );
}
