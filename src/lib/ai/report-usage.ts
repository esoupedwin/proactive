import type { SupabaseClient } from "@supabase/supabase-js";
import type { Report, ReportUsage } from "../types";
import { addUsage } from "./usage";

/**
 * Adds usage spent outside the generation run — a standalone expert run, a
 * mentor "share more" expansion — into the report's stored total.
 *
 * The generate/cron paths already re-snapshot `reports.usage` after their
 * experts finish, so calls made later would otherwise never be counted. Keeping
 * every report-attached cost in one column is what lets the lifetime total on
 * Settings sum `reports.usage` alone, with nothing double-counted.
 *
 * Best-effort: accounting must never fail the request that did the real work.
 */
export async function foldUsageIntoReport(
  supabase: SupabaseClient,
  reportId: string,
  delta: ReportUsage,
): Promise<void> {
  if (delta.calls === 0) return;
  try {
    const { data } = await supabase
      .from("reports")
      .select("usage")
      .eq("id", reportId)
      .maybeSingle<Pick<Report, "usage">>();

    await supabase
      .from("reports")
      .update({ usage: data?.usage ? addUsage(data.usage, delta) : delta })
      .eq("id", reportId);
  } catch (err) {
    console.error("folding usage into report failed", err);
  }
}
