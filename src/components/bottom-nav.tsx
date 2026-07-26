import Link from "next/link";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { LinkPending } from "./link-pending";

export interface NavTopic {
  id: string;
  title: string;
}

/** Fixed bottom bar: previous topic / current title / next topic / settings. */
export function BottomNav({
  topics,
  currentId,
}: {
  topics: NavTopic[];
  currentId: string;
}) {
  const index = topics.findIndex((t) => t.id === currentId);
  const prev = index > 0 ? topics[index - 1] : topics[topics.length - 1];
  const next =
    index >= 0 && index < topics.length - 1 ? topics[index + 1] : topics[0];
  const current = index >= 0 ? topics[index] : undefined;
  const hasSiblings = topics.length > 1;

  return (
    <nav
      aria-label="Topic navigation"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md border-t border-rule bg-paper"
    >
      <div className="flex items-center justify-between gap-1 px-2 py-2">
        <Link
          href="/settings"
          aria-label="Settings"
          className="rounded-md p-2.5 hover:bg-neutral-100"
        >
          <LinkPending className="size-5">
            <Settings className="size-5" aria-hidden />
          </LinkPending>
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          {hasSiblings && prev ? (
            <Link
              href={`/topics/${prev.id}`}
              aria-label={`Previous topic: ${prev.title}`}
              className="rounded-md p-2.5 hover:bg-neutral-100"
            >
              <LinkPending className="size-5">
                <ChevronLeft className="size-5" aria-hidden />
              </LinkPending>
            </Link>
          ) : (
            <span className="p-2.5 text-rule">
              <ChevronLeft className="size-5" aria-hidden />
            </span>
          )}

          <span className="min-w-0 truncate text-sm font-semibold">
            {current?.title ?? ""}
          </span>

          {hasSiblings && next ? (
            <Link
              href={`/topics/${next.id}`}
              aria-label={`Next topic: ${next.title}`}
              className="rounded-md p-2.5 hover:bg-neutral-100"
            >
              <LinkPending className="size-5">
                <ChevronRight className="size-5" aria-hidden />
              </LinkPending>
            </Link>
          ) : (
            <span className="p-2.5 text-rule">
              <ChevronRight className="size-5" aria-hidden />
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}
