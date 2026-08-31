import { redirect } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { ParagraphWithLinkBadges } from "@/components/link-badges";
import { SettingsHeader } from "@/components/settings-header";
import { formatDateTime } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Explanation } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Recent history is plenty; nobody scrolls a thousand lookups. */
const HISTORY_LIMIT = 100;

type HistoryRow = Pick<
  Explanation,
  "id" | "selection" | "explanation" | "created_at"
> & {
  /** Joined through the topic FK; RLS keeps it the user's own. */
  topics: { title: string } | null;
};

/** Settings → Tell me more — every highlighted lookup, newest first. */
export default async function ExplanationHistoryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("explanations")
    .select("id, selection, explanation, created_at, topics(title)")
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const rows = (data ?? []) as unknown as HistoryRow[];

  return (
    <main className="px-5 pb-16 pt-6">
      <SettingsHeader
        title="Tell me more"
        description="Everything you highlighted for a closer look, newest first."
      />

      {rows.length === 0 ? (
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-8 text-center text-sm text-ink-faint">
          Nothing yet. Highlight any text in a briefing and tap “Tell me more”
          — the answers collect here.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, i) => (
            <li key={row.id}>
              {/* Native <details>, so the page stays a server component and
                  the cards work before any JS loads. The newest opens on
                  arrival — the rest collapse so the list stays scannable. */}
              <details
                open={i === 0}
                className="group rounded-md border border-rule"
              >
                <summary className="flex cursor-pointer list-none items-start gap-3 rounded-md px-4 py-3 hover:bg-neutral-50 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink-faint">
                      {[row.topics?.title, formatDateTime(row.created_at)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1.5 border-l-2 border-rule pl-3 text-sm font-medium leading-relaxed">
                      {row.selection}
                    </p>
                  </div>
                  <ChevronDown
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="border-t border-rule px-4 py-3 text-ink-soft">
                  {row.explanation.split(/\n{2,}/).map((paragraph, j) => (
                    <ParagraphWithLinkBadges key={j} text={paragraph} />
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
