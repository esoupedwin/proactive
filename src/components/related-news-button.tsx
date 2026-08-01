"use client";

import { useEffect, useState } from "react";
import { Newspaper, X } from "lucide-react";
import type { MarkedNewsResult } from "@/lib/news-search";
import { Badge, Spinner } from "./ui";

interface RelatedNewsResponse {
  query: string;
  provider: string;
  window_days: number;
  new_count: number;
  results: MarkedNewsResult[];
}

/**
 * Direct news search for the topic (Brave/SerpApi via the stored query),
 * shown in a popup with each article flagged NEW when it isn't among the
 * topic's already-collected sources.
 */
export function RelatedNewsButton({ topicId }: { topicId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RelatedNewsResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function openAndSearch() {
    setOpen(true);
    setState("loading");
    setError(null);
    try {
      const res = await fetch(`/api/topics/${topicId}/related-news`, {
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as
        | (RelatedNewsResponse & { error?: string })
        | null;
      if (res.ok && body) {
        setData(body);
        setState("idle");
      } else {
        setError(body?.error ?? "Search failed. Try again.");
        setState("error");
      }
    } catch {
      setError("Network error while searching.");
      setState("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openAndSearch}
        aria-haspopup="dialog"
        aria-label="Search related news for this topic"
        className="inline-flex size-11 items-center justify-center rounded-md border border-rule hover:bg-neutral-100"
      >
        <Newspaper className="size-5" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Related news"
          className="fixed inset-0 z-50 mx-auto flex w-full max-w-md items-center justify-center p-4"
        >
          <button
            aria-label="Close"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex max-h-[85dvh] w-full flex-col rounded-md border border-rule bg-paper shadow-lg">
            <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold">Related news</h2>
                {data && (
                  <p className="mt-0.5 truncate text-xs text-ink-faint">
                    “{data.query}” · last{" "}
                    {data.window_days === 1 ? "day" : `${data.window_days} days`}{" "}
                    · {data.new_count} new
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-m-1.5 shrink-0 rounded-md p-1.5 text-ink-soft hover:bg-neutral-100 hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-2">
              {state === "loading" && (
                <p
                  role="status"
                  className="flex items-center gap-2 py-8 text-sm text-ink-faint"
                >
                  <Spinner /> Searching the news…
                </p>
              )}

              {state === "error" && (
                <p role="alert" className="py-8 text-sm text-red-700">
                  {error}
                </p>
              )}

              {state === "idle" && data && data.results.length === 0 && (
                <p className="py-8 text-center text-sm text-ink-faint">
                  No news found within the last{" "}
                  {data.window_days === 1 ? "day" : `${data.window_days} days`}.
                </p>
              )}

              {state === "idle" && data && data.results.length > 0 && (
                <ul className="divide-y divide-rule">
                  {data.results.map((result) => (
                    <li key={result.url} className="py-3">
                      <div className="flex items-center gap-2">
                        {result.is_new ? (
                          <Badge tone="active">new</Badge>
                        ) : (
                          <Badge>seen</Badge>
                        )}
                        <span className="min-w-0 truncate text-xs text-ink-faint">
                          {[result.source, result.published]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block text-sm font-semibold leading-snug hover:underline"
                      >
                        {result.title}
                      </a>
                      {result.description && (
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                          {result.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
