import { redirect } from "next/navigation";
import { SettingsHeader } from "@/components/settings-header";
import { sumUsage } from "@/lib/ai/usage";
import { formatTokens, formatUsdDetailed } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Report } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Settings → Cost — lifetime LLM spend across every topic and run. */
export default async function CostPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: usageRows }, { count: topicCount }] = await Promise.all([
    // RLS scopes this to the signed-in user; every report-attached LLM cost
    // (pipeline, experts, expansions) lands in reports.usage.
    supabase.from("reports").select("usage").not("usage", "is", null),
    // Only the number is shown, so count rather than fetch the rows.
    supabase.from("topics").select("id", { count: "exact", head: true }),
  ]);
  const spend = sumUsage(
    ((usageRows ?? []) as Pick<Report, "usage">[]).map((row) => row.usage),
  );
  const topics = topicCount ?? 0;

  return (
    <main className="px-5 pb-16 pt-6">
      <SettingsHeader
        title="Cost"
        description="What Proactive has spent on your behalf."
      />

      <div className="rounded-md border border-rule px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">Total LLM cost so far</p>
          <p className="font-mono text-xl font-semibold tabular-nums">
            {formatUsdDetailed(spend.estimated_cost_usd)}
          </p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">
          {spend.runs === 0
            ? "No updates generated yet."
            : `${formatTokens(spend.input_tokens + spend.output_tokens)} tokens · ${spend.calls} model call${spend.calls === 1 ? "" : "s"} · ${spend.web_search_calls} web search${spend.web_search_calls === 1 ? "" : "es"} across ${spend.runs} update${spend.runs === 1 ? "" : "s"} in ${topics} topic${topics === 1 ? "" : "s"}.`}
        </p>
        {spend.unpriced_models.length > 0 && (
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            Excludes {spend.unpriced_models.join(", ")} — no pricing configured,
            so the real total is higher.
          </p>
        )}
      </div>
    </main>
  );
}
