import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { PromptFlowTabs } from "@/components/prompt-flow-tabs";
import { Badge } from "@/components/ui";
import { formatDateTime, formatTokens } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LlmCallTrace, Report, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Friendly names for known stages (tools, legacy pipeline, experts). */
const STAGE_LABEL: Record<string, string> = {
  // Searches
  web_search: "Web search",
  // Info Tracker tools
  "tool:exa_search": "Exa semantic web search",
  "tool:search_existing_extracts": "Check store for duplicates",
  "tool:record_extract": "Record extract",
  "tool:corroborate_extract": "Corroborate extract",
  // Reporter tools
  "tool:get_new_extracts": "Read new extracts since last report",
  "tool:search_extracts": "Search the extract store",
  "tool:record_assessment": "Record assessment",
  "tool:get_recent_assessments": "Recall recent assessments",
  // Experts
  mentor_tips: "Mentor — teaching tips",
  mentor_more: "Mentor — deeper explanation",
  analyst_analysis: "Analyst — interpret the report",
  // Legacy pipeline stages (older stored traces)
  search_plan: "Topic planner — build search queries",
  followup_queries: "Follow-up planner — target queries from news findings",
  seek_result: "Information seeker — web search",
  extraction_result: "Extractor — structure the found sources",
  report_draft: "Update reporter — write the briefing",
  memory_update: "Memory updater — fold report into topic memory",
};

function stageLabel(stage: string): string {
  const known = STAGE_LABEL[stage];
  if (known) return known;
  const turn = stage.match(/^agent_turn:[^ ]+ \((.+)\)$/);
  if (turn) return `Model turn ${turn[1]}`;
  return stage;
}

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

function CallList({
  calls,
  emptyMessage,
}: {
  calls: LlmCallTrace[];
  emptyMessage: string;
}) {
  if (calls.length === 0) {
    return (
      <p className="rounded-md border border-rule bg-neutral-50 px-4 py-8 text-center text-sm text-ink-faint">
        {emptyMessage}
      </p>
    );
  }
  return (
    <ol className="space-y-4">
      {calls.map((call) => {
        // Searches are shown inline — the query IS the content.
        const isSearch = call.stage === "web_search";
        // Empty (or empty-args "{}") sections get no collapsible at all.
        const hasContent = (text: string) => {
          const trimmed = text.trim();
          return trimmed !== "" && trimmed !== "{}";
        };
        const showInstructions = !isSearch && hasContent(call.instructions);
        const showInput = !isSearch && hasContent(call.input);
        return (
          <li
            key={call.index}
            className="rounded-md border border-rule bg-paper"
          >
            <div
              className={
                showInstructions || showInput
                  ? "border-b border-rule px-4 py-3"
                  : "px-4 py-3"
              }
            >
              <p className="text-sm font-semibold leading-snug">
                {call.index}. {stageLabel(call.stage)}
              </p>
              {isSearch && (
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {call.input}
                </p>
              )}
              {!isSearch && exaQuery(call) && (
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {exaQuery(call)}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge>{call.model}</Badge>
                <Badge>{call.tier} tier</Badge>
                {!isSearch && call.used_web_search && (
                  <Badge tone="active">
                    {call.web_search_calls} web search
                    {call.web_search_calls === 1 ? "" : "es"}
                  </Badge>
                )}
                {call.error && <Badge tone="paused">failed</Badge>}
              </div>
              {!isSearch && (
                <p className="mt-1.5 text-xs text-ink-faint">
                  {(call.duration_ms / 1000).toFixed(1)}s ·{" "}
                  {formatTokens(call.input_tokens)} in /{" "}
                  {formatTokens(call.output_tokens)} out
                </p>
              )}
              {call.error && (
                <p className="mt-1 text-xs text-red-700">{call.error}</p>
              )}
            </div>

            {showInstructions && (
              <details className={showInput ? "border-b border-rule" : ""}>
                <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft hover:bg-neutral-50">
                  Instructions (system prompt)
                </summary>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-rule bg-neutral-50 px-4 py-3 font-mono text-xs leading-relaxed">
                  {call.instructions}
                </pre>
              </details>
            )}

            {showInput && (
              <details>
                <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft hover:bg-neutral-50">
                  Input (task content)
                </summary>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-rule bg-neutral-50 px-4 py-3 font-mono text-xs leading-relaxed">
                  {call.input}
                </pre>
              </details>
            )}
          </li>
        );
      })}
    </ol>
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
