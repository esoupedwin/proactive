import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { Badge } from "@/components/ui";
import { formatDateTime, paginate } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Source, SourceType, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

const TYPE_LABEL: Record<SourceType, string> = {
  news: "News",
  reddit: "Reddit",
  medium: "Medium",
};

/** All extracts collected for a topic across reports, newest first, paginated. */
export default async function TopicExtractsPage({
  params,
  searchParams,
}: {
  params: Promise<{ topicId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { topicId } = await params;
  const { page: pageParam } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("id", topicId)
    .maybeSingle<Topic>();
  if (!topic) notFound();

  const { count } = await supabase
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("topic_id", topicId);
  const total = count ?? 0;

  const { page, totalPages, from, to } = paginate(
    total,
    Number(pageParam ?? "1"),
    PAGE_SIZE,
  );

  let extracts: Source[] = [];
  if (total > 0) {
    const { data } = await supabase
      .from("sources")
      .select("*")
      .eq("topic_id", topicId)
      .order("created_at", { ascending: false })
      .range(from, to);
    extracts = (data ?? []) as Source[];
  }

  const pageHref = (p: number) => `/topics/${topicId}/extracts?page=${p}`;

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
          {total} extract{total === 1 ? "" : "s"} collected across all reports,
          newest first.
        </p>
      </header>

      {extracts.length === 0 ? (
        <p className="rounded-md border border-rule bg-neutral-50 px-4 py-8 text-center text-sm text-ink-faint">
          No extracts yet. Generate an update to start collecting.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {extracts.map((extract) => (
            <li key={extract.id} className="py-4">
              <div className="flex items-center gap-2">
                <Badge>{TYPE_LABEL[extract.source_type]}</Badge>
                {(extract.novelty === "new" || extract.novelty === "update") && (
                  <Badge tone="active">{extract.novelty}</Badge>
                )}
                <span className="text-xs text-ink-faint">
                  Collected {formatDateTime(extract.created_at)}
                </span>
              </div>
              <a
                href={extract.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 block text-sm font-semibold leading-snug hover:underline"
              >
                {extract.title}
              </a>
              <p className="mt-0.5 text-xs text-ink-faint">
                {[extract.publisher, extract.published_at]
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
    </main>
  );
}
