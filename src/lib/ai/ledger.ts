import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerEntry, UsageCollector } from "./usage";

/**
 * Persists a collector's recorded calls into the llm_calls ledger — one row
 * per OpenAI call, stamped with who triggered it and what it was for.
 *
 * Best-effort by contract: accounting must never fail the request that did
 * the real work, so errors are logged and swallowed. Draining the collector
 * makes the flush idempotent-by-construction — flushing twice (success path
 * plus a catch block) writes each call once.
 */
export async function flushLedger(
  supabase: SupabaseClient,
  collector: UsageCollector,
  context: {
    userId: string;
    topicId?: string | null;
    reportId?: string | null;
  },
): Promise<void> {
  let entries: LedgerEntry[] = [];
  try {
    entries = collector.drainLedger();
    if (entries.length === 0) return;
    const { error } = await supabase.from("llm_calls").insert(
      entries.map((e) => ({
        user_id: context.userId,
        topic_id: context.topicId ?? null,
        report_id: context.reportId ?? null,
        ...e,
      })),
    );
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error(
      `writing llm_calls ledger failed (${entries.length} entries dropped)`,
      err,
    );
  }
}
