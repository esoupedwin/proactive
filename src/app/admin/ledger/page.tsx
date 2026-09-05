import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { SettingsHeader } from "@/components/settings-header";
import { Button, Select } from "@/components/ui";
import { isAdmin } from "@/lib/admin";
import { formatDateTime, formatUsdDetailed, paginate } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LlmCall } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** Sortable columns, whitelisted — the sort param goes into the query. */
const SORTS: Record<string, { column: string; label: string }> = {
  time: { column: "created_at", label: "Newest first" },
  cost: { column: "estimated_cost_usd", label: "Highest cost" },
  input: { column: "input_tokens", label: "Most input tokens" },
  output: { column: "output_tokens", label: "Most output tokens" },
  searches: { column: "web_search_calls", label: "Most web searches" },
};

/**
 * The llm_calls ledger: every OpenAI call, who and what triggered it, and
 * what it consumed. The admin's reconciliation view — filter to an activity
 * or model, sort by cost, and compare day totals against OpenAI's dashboard.
 */
export default async function AdminLedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Same posture as /admin: non-admins get a 404, not a hint.
  if (!isAdmin(user)) notFound();

  const params = await searchParams;
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";
  const activity = one(params.activity);
  const model = one(params.model);
  const sortKey = SORTS[one(params.sort)] ? one(params.sort) : "time";
  const requestedPage = Number(one(params.page)) || 1;

  // Filter options come from the data itself — activities and models are
  // open-ended labels, not enums. Recent rows are plenty to enumerate them.
  const { data: optionRows } = await supabase
    .from("llm_calls")
    .select("activity, model")
    .order("created_at", { ascending: false })
    .limit(1000);
  const activities = [
    ...new Set((optionRows ?? []).map((r) => r.activity as string)),
  ].sort();
  const models = [
    ...new Set((optionRows ?? []).map((r) => r.model as string)),
  ].sort();

  let countQuery = supabase
    .from("llm_calls")
    .select("id", { count: "exact", head: true });
  if (activity) countQuery = countQuery.eq("activity", activity);
  if (model) countQuery = countQuery.eq("model", model);
  const { count } = await countQuery;

  const { page, totalPages, from, to } = paginate(
    count ?? 0,
    requestedPage,
    PAGE_SIZE,
  );

  let rowQuery = supabase
    .from("llm_calls")
    .select("*")
    .order(SORTS[sortKey]!.column, { ascending: false, nullsFirst: false })
    // Stable tiebreak so pagination never shows a row twice.
    .order("id", { ascending: true })
    .range(from, to);
  if (activity) rowQuery = rowQuery.eq("activity", activity);
  if (model) rowQuery = rowQuery.eq("model", model);
  const { data } = await rowQuery;
  const rows = (data ?? []) as LlmCall[];

  // Topic titles for the rows on this page (topic_id is a bare uuid, not a
  // FK — a deleted topic keeps its ledger rows, so a title can be missing).
  const topicIds = [...new Set(rows.map((r) => r.topic_id).filter(Boolean))];
  const { data: topicRows } = topicIds.length
    ? await supabase.from("topics").select("id, title").in("id", topicIds)
    : { data: [] };
  const topicTitle = new Map(
    (topicRows ?? []).map((t) => [t.id as string, t.title as string]),
  );

  const pageQuery = (p: number) => {
    const q = new URLSearchParams();
    if (activity) q.set("activity", activity);
    if (model) q.set("model", model);
    if (sortKey !== "time") q.set("sort", sortKey);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/admin/ledger${s ? `?${s}` : ""}`;
  };

  const pageCost = rows.reduce((n, r) => n + (r.estimated_cost_usd ?? 0), 0);
  const pageTokens = rows.reduce(
    (n, r) => n + r.input_tokens + r.output_tokens,
    0,
  );

  return (
    <main className="px-5 pb-16 pt-6">
      <SettingsHeader
        title="LLM Ledger"
        description="Every OpenAI call: when, what for, which model, and what it consumed."
      />

      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-2"
        aria-label="Filter and sort the ledger"
      >
        <label className="flex w-44 flex-col gap-1 text-xs text-ink-faint">
          Activity
          <Select name="activity" defaultValue={activity}>
            <option value="">All activities</option>
            {activities.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex w-44 flex-col gap-1 text-xs text-ink-faint">
          Model
          <Select name="model" defaultValue={model}>
            <option value="">All models</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex w-44 flex-col gap-1 text-xs text-ink-faint">
          Sort
          <Select name="sort" defaultValue={sortKey}>
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-8 text-center text-sm text-ink-faint">
          No calls recorded{activity || model ? " for this filter" : " yet"}.
          The ledger fills as reports generate and features run.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-rule">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-rule bg-neutral-50 text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Activity</th>
                  <th className="px-3 py-2 font-semibold">Topic</th>
                  <th className="px-3 py-2 font-semibold">Model</th>
                  <th className="px-3 py-2 text-right font-semibold">In</th>
                  <th className="px-3 py-2 text-right font-semibold">Cached</th>
                  <th className="px-3 py-2 text-right font-semibold">Out</th>
                  <th className="px-3 py-2 text-right font-semibold">Search</th>
                  <th className="px-3 py-2 text-right font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-soft">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-3 py-2 font-medium">{row.activity}</td>
                    <td className="max-w-44 truncate px-3 py-2 text-ink-soft">
                      {row.topic_id
                        ? (topicTitle.get(row.topic_id) ?? "(deleted topic)")
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-soft">
                      {row.model}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.input_tokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-faint">
                      {row.cached_input_tokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.output_tokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.web_search_calls || ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatUsdDetailed(row.estimated_cost_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
            <p>
              {count} call{count === 1 ? "" : "s"} · this page:{" "}
              {pageTokens.toLocaleString()} tokens ·{" "}
              {formatUsdDetailed(pageCost)}
            </p>
            {totalPages > 1 && (
              <p className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={pageQuery(page - 1)}
                    aria-label="Previous page"
                    className="inline-flex size-8 items-center justify-center rounded-md border border-rule hover:bg-neutral-100"
                  >
                    <LinkPending>
                      <ChevronLeft className="size-4" aria-hidden />
                    </LinkPending>
                  </Link>
                ) : (
                  <span className="inline-flex size-8 items-center justify-center rounded-md border border-rule opacity-40">
                    <ChevronLeft className="size-4" aria-hidden />
                  </span>
                )}
                Page {page} of {totalPages}
                {page < totalPages ? (
                  <Link
                    href={pageQuery(page + 1)}
                    aria-label="Next page"
                    className="inline-flex size-8 items-center justify-center rounded-md border border-rule hover:bg-neutral-100"
                  >
                    <LinkPending>
                      <ChevronRight className="size-4" aria-hidden />
                    </LinkPending>
                  </Link>
                ) : (
                  <span className="inline-flex size-8 items-center justify-center rounded-md border border-rule opacity-40">
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                )}
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
