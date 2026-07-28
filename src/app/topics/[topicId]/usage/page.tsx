import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { Badge } from "@/components/ui";
import { estimateCallCostUsd } from "@/lib/ai/usage";
import {
  formatDateTime,
  formatTokens,
  formatUsdDetailed,
} from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Report, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Friendly names for the pipeline stages (structured-output schema names). */
const STAGE_LABEL: Record<string, string> = {
  search_plan: "Topic planner",
  followup_queries: "Follow-up planner",
  seek_result: "Information seeker — web search",
  extraction_result: "Extractor",
  report_draft: "Update reporter",
  memory_update: "Memory updater",
  mentor_tips: "Mentor — teaching tips",
  mentor_more: "Mentor — deeper explanation",
};

/** Per-step token and cost breakdown for the topic's latest report. */
export default async function UsagePage({
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
    .select("id, created_at, status, trace, usage")
    .eq("topic_id", topicId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<
      Pick<Report, "id" | "created_at" | "status" | "trace" | "usage">
    >();

  const calls = report?.trace?.calls ?? [];
  const usage = report?.usage ?? null;

  // Per-step cost, computed from each call's own model and token counts.
  const rows = calls.map((call) => ({
    call,
    cost: estimateCallCostUsd(
      call.model,
      call.input_tokens,
      call.output_tokens,
      call.web_search_calls,
    ),
  }));

  const totals = rows.reduce(
    (acc, { call, cost }) => ({
      input: acc.input + call.input_tokens,
      output: acc.output + call.output_tokens,
      searches: acc.searches + call.web_search_calls,
      cost: cost === null ? acc.cost : (acc.cost ?? 0) + cost,
    }),
    { input: 0, output: 0, searches: 0, cost: 0 as number | null },
  );

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
        <h1 className="text-2xl font-bold tracking-tight">Tokens &amp; cost</h1>
        <p className="mt-1 text-xs text-ink-faint">
          {report
            ? `Per-step breakdown for the report of ${formatDateTime(report.created_at)}.`
            : "No report yet."}
        </p>
      </header>

      {rows.length > 0 ? (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-3">
            <Stat label="Total tokens" value={formatTokens(totals.input + totals.output)} />
            <Stat label="Estimated cost" value={formatUsdDetailed(totals.cost)} />
            <Stat label="Model calls" value={String(rows.length)} />
            <Stat label="Web searches" value={String(totals.searches)} />
          </dl>

          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Tokens and estimated cost for each pipeline step
            </caption>
            <thead>
              <tr className="border-b border-rule text-xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="py-2 font-semibold">
                  Step
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Tokens
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ call, cost }) => (
                <tr key={call.index} className="border-b border-rule align-top">
                  <td className="py-3 pr-2">
                    <p className="font-medium leading-snug">
                      {call.index}. {STAGE_LABEL[call.stage] ?? call.stage}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge>{call.model}</Badge>
                      {call.web_search_calls > 0 && (
                        <Badge tone="active">
                          {call.web_search_calls} search
                          {call.web_search_calls === 1 ? "" : "es"}
                        </Badge>
                      )}
                      {call.error && <Badge tone="paused">failed</Badge>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-3 text-right font-mono text-xs tabular-nums text-ink-soft">
                    {formatTokens(call.input_tokens)} in
                    <br />
                    {formatTokens(call.output_tokens)} out
                  </td>
                  <td className="whitespace-nowrap py-3 pl-2 text-right font-mono text-xs tabular-nums">
                    {formatUsdDetailed(cost)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-3">Total</td>
                <td className="whitespace-nowrap py-3 text-right font-mono text-xs tabular-nums">
                  {formatTokens(totals.input)} in
                  <br />
                  {formatTokens(totals.output)} out
                </td>
                <td className="whitespace-nowrap py-3 pl-2 text-right font-mono text-xs tabular-nums">
                  {formatUsdDetailed(totals.cost)}
                </td>
              </tr>
            </tfoot>
          </table>

          <p className="mt-6 text-xs leading-relaxed text-ink-faint">
            Token counts are exact, as reported by OpenAI. Costs are estimates
            from the app&apos;s price table (including $0.01 per web search) —
            OpenAI&apos;s dashboard remains the billing source of truth. A dash
            means that model has no pricing configured; set{" "}
            <code>OPENAI_PRICING_JSON</code> to add it.
          </p>
        </>
      ) : usage ? (
        <>
          <p className="mb-5 rounded-md border border-rule bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-ink-soft">
            This report was generated before per-step tracing was recorded, so
            only the per-model totals are available. Generate a new update to
            see the full step-by-step breakdown.
          </p>
          <dl className="mb-6 grid grid-cols-2 gap-3">
            <Stat
              label="Total tokens"
              value={formatTokens(usage.input_tokens + usage.output_tokens)}
            />
            <Stat
              label="Estimated cost"
              value={formatUsdDetailed(usage.estimated_cost_usd)}
            />
            <Stat label="Model calls" value={String(usage.calls)} />
            <Stat label="Web searches" value={String(usage.web_search_calls)} />
          </dl>
          <ul className="divide-y divide-rule border-t border-rule">
            {Object.entries(usage.by_model).map(([model, m]) => (
              <li key={model} className="flex items-baseline justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{model}</p>
                  <p className="text-xs text-ink-faint">
                    {m.calls} call{m.calls === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="whitespace-nowrap font-mono text-xs tabular-nums text-ink-soft">
                  {formatTokens(m.input_tokens)} in /{" "}
                  {formatTokens(m.output_tokens)} out
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-8 text-center text-sm text-ink-faint">
          No usage recorded yet. Generate an update to see how many tokens each
          step uses and what it costs.
        </p>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-rule px-3 py-2.5">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-mono text-base tabular-nums">{value}</dd>
    </div>
  );
}
