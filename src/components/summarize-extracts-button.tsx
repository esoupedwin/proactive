"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Markdown } from "./markdown";
import { Spinner } from "./ui";

/**
 * "Summarize last N days" on the extracts page: digests the recent extracts
 * under the current factor filter via a cheap OpenRouter model. The parent
 * keys this by the active filter, so switching filters clears the result.
 */
export function SummarizeExtractsButton({
  topicId,
  factor,
  days,
}: {
  topicId: string;
  /** The page's active filter value; "" for all, "unfiled" for the null bucket. */
  factor: string;
  days: number;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [summary, setSummary] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  async function summarize() {
    setState("loading");
    setEmpty(false);
    try {
      const res = await fetch(`/api/topics/${topicId}/extracts/summary`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ factor }),
      });
      const body = (await res.json().catch(() => null)) as {
        summary?: string | null;
        extractCount?: number;
        error?: string;
      } | null;
      if (!res.ok) {
        setState("error");
        return;
      }
      if (!body?.summary) {
        setEmpty(true);
        setState("idle");
        setSummary(null);
        return;
      }
      setSummary(body.summary);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mb-4">
      {summary === null ? (
        <button
          type="button"
          onClick={summarize}
          disabled={state === "loading"}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-rule px-3 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
        >
          {state === "loading" ? (
            <>
              <Spinner className="size-4" /> Summarizing…
            </>
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden /> Summarize last {days}{" "}
              days
            </>
          )}
        </button>
      ) : (
        <section
          aria-label="Extracts summary"
          className="rounded-md border border-rule bg-neutral-50 px-4 py-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Last {days} days{factor && factor !== "unfiled" ? ` · ${factor}` : ""}
            </h2>
            <button
              type="button"
              onClick={() => setSummary(null)}
              aria-label="Dismiss summary"
              className="-m-1 rounded-md p-1 text-ink-faint hover:bg-neutral-100 hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <Markdown text={summary} />
        </section>
      )}

      {state === "error" && (
        <p className="mt-2 text-xs text-red-700">
          Could not summarize right now — try again.
        </p>
      )}
      {empty && (
        <p className="mt-2 text-xs text-ink-faint">
          Nothing recorded in the last {days} days
          {factor ? " for this filter" : ""} — nothing to summarize.
        </p>
      )}
    </div>
  );
}
