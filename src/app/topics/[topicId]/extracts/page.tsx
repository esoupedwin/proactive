import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FactorFilter } from "@/components/factor-filter";
import { LinkPending } from "@/components/link-pending";
import { SummarizeExtractsButton } from "@/components/summarize-extracts-button";
import { SUMMARY_WINDOW_DAYS } from "@/lib/ai/extracts-summary";
import { openRouterConfigured } from "@/lib/ai/openrouter";
import { Badge } from "@/components/ui";
import { formatDateTime, paginate } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { frameFactorNames } from "@/lib/types";
import type { ExtractRecord, SourceType, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

const TYPE_LABEL: Record<SourceType, string> = {
  news: "News",
  reddit: "Reddit",
  medium: "Medium",
};

/**
 * The ?factor= value for extracts the tracker filed under no frame factor.
 * A real factor by this name wins the match, so the collision is harmless.
 */
const UNFILED = "unfiled";

/** Readable source site, e.g. "reuters.com", when no publisher was recorded. */
function sourceHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

/** The topic's persistent extract store (Info Tracker output), newest first, paginated. */
export default async function TopicExtractsPage({
  params,
  searchParams,
}: {
  params: Promise<{ topicId: string }>;
  searchParams: Promise<{ page?: string; factor?: string }>;
}) {
  const { topicId } = await params;
  const { page: pageParam, factor: factorParam } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("id", topicId)
    .maybeSingle<Topic>();
  if (!topic) notFound();

  const factors = frameFactorNames(topic.interest_frame ?? []);
  // Only a factor the frame still lists (or the unfiled bucket) filters;
  // anything else — a stale link, a renamed factor — falls back to All.
  const selected =
    factorParam && (factors.includes(factorParam) || factorParam === UNFILED)
      ? factorParam
      : "";

  const countQuery = () =>
    supabase
      .from("extracts")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topicId);
  // One head count per pill, in parallel: the pills need the numbers anyway,
  // and the selected one is the row count pagination runs on.
  const [all, unfiled, ...perFactor] = await Promise.all([
    countQuery(),
    countQuery().is("factor", null),
    ...factors.map((name) => countQuery().eq("factor", name)),
  ]);
  const total = all.count ?? 0;
  const countOf = (value: string) =>
    (value === ""
      ? all.count
      : value === UNFILED
        ? unfiled.count
        : perFactor[factors.indexOf(value)]?.count) ?? 0;
  const shown = countOf(selected);

  const { page, totalPages, from, to } = paginate(
    shown,
    Number(pageParam ?? "1"),
    PAGE_SIZE,
  );

  let extracts: ExtractRecord[] = [];
  if (shown > 0) {
    let rowQuery = supabase
      .from("extracts")
      .select("*")
      .eq("topic_id", topicId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (selected === UNFILED) rowQuery = rowQuery.is("factor", null);
    else if (selected) rowQuery = rowQuery.eq("factor", selected);
    const { data } = await rowQuery;
    extracts = (data ?? []) as ExtractRecord[];
  }

  const href = (value: string, p = 1) => {
    const q = new URLSearchParams();
    if (value) q.set("factor", value);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/topics/${topicId}/extracts${s ? `?${s}` : ""}`;
  };
  const pageHref = (p: number) => href(selected, p);

  // Changing the filter starts at page 1 — page 4 of one factor means
  // nothing under the next.
  const filterOptions = [
    { value: "", label: "All factors", count: total, href: href("") },
    ...factors.map((name) => ({
      value: name,
      label: name,
      count: countOf(name),
      href: href(name),
    })),
    // Only offered when something actually landed outside the frame.
    ...((unfiled.count ?? 0) > 0
      ? [
          {
            value: UNFILED,
            label: "Unfiled",
            count: unfiled.count ?? 0,
            href: href(UNFILED),
          },
        ]
      : []),
  ];

  const results = (
    <>
      {/* Digest of the window under the current filter. Keyed by filter so
          switching filters clears a stale summary; hidden entirely when
          OpenRouter isn't configured rather than offering a dead button. */}
      {openRouterConfigured() && total > 0 && (
        <SummarizeExtractsButton
          key={selected}
          topicId={topicId}
          factor={selected}
          days={SUMMARY_WINDOW_DAYS}
        />
      )}
      {extracts.length === 0 ? (
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-8 text-center text-sm text-ink-faint">
          {selected
            ? `No extracts filed under ${selected === UNFILED ? "no factor" : selected} yet.`
            : "No extracts yet. The Info Tracker records them on its schedule, or generate an update to collect some now."}
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {extracts.map((extract) => (
            <li key={extract.id} className="py-4">
              <div className="flex items-center gap-2">
                <Badge>{TYPE_LABEL[extract.source_type]}</Badge>
                {/* No "new" badge: almost every row is new, so it carried no
                    signal. A change to something already recorded still does. */}
                {extract.novelty === "update" && (
                  <Badge tone="active">update</Badge>
                )}
                {extract.corroborations > 0 && (
                  <Badge>×{extract.corroborations + 1} sources</Badge>
                )}
                {extract.factor && <Badge>{extract.factor}</Badge>}
              </div>
              <p className="mt-1.5 text-xs text-ink-faint">
                Collected {formatDateTime(extract.created_at)}
              </p>
              <a
                href={extract.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 block text-sm font-semibold leading-snug hover:underline"
              >
                {extract.title}
              </a>
              <p className="mt-0.5 text-xs text-ink-faint">
                {[
                  extract.publisher || sourceHost(extract.url),
                  extract.published_at,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {extract.gist}
              </p>
              {extract.contradiction && (
                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                  Contradiction: {extract.contradiction}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Extract pages"
          className="mt-6 flex items-center justify-between border-t border-rule pt-4"
        >
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="inline-flex min-h-11 items-center gap-1 rounded-md border border-rule px-4 text-sm font-medium hover:bg-neutral-100"
            >
              <LinkPending>
                <ChevronLeft className="size-4" aria-hidden />
              </LinkPending>{" "}
              Newer
            </Link>
          ) : (
            <span aria-hidden className="min-h-11 px-4" />
          )}

          <span className="text-xs text-ink-faint">
            Page {page} of {totalPages}
          </span>

          {page < totalPages ? (
            <Link
              href={pageHref(page + 1)}
              className="inline-flex min-h-11 items-center gap-1 rounded-md border border-rule px-4 text-sm font-medium hover:bg-neutral-100"
            >
              Older{" "}
              <LinkPending>
                <ChevronRight className="size-4" aria-hidden />
              </LinkPending>
            </Link>
          ) : (
            <span aria-hidden className="min-h-11 px-4" />
          )}
        </nav>
      )}
    </>
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
        <h1 className="text-2xl font-bold tracking-tight">Extracts</h1>
        <p className="mt-1 text-xs text-ink-faint">
          {total} extract{total === 1 ? "" : "s"} recorded by the Info
          Tracker, newest first.
        </p>
      </header>

      {/* Without a frame there is nothing to filter by, so the results
          stand on their own. */}
      {filterOptions.length > 1 ? (
        <FactorFilter
          options={filterOptions}
          active={selected}
          label="Filter by interest factor"
        >
          {results}
        </FactorFilter>
      ) : (
        results
      )}
    </main>
  );
}
