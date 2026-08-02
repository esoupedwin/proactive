"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { RefreshCw } from "lucide-react";
import { formatElapsed, formatUsageSummary } from "@/lib/reports";
import type { ReportUsage } from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button, Spinner } from "./ui";

type GenerateState = "idle" | "loading" | "success" | "error";

const STAGE_POLL_MS = 1200;

/**
 * Manually trigger a new report. While the request runs it shows the
 * pipeline's live stage (polled from the report row) and a millisecond
 * elapsed timer.
 *
 * `compact` renders an icon-only square for the action row under the title;
 * the live status card and result message are identical either way.
 */
export function GenerateButton({
  topicId,
  compact = false,
}: {
  topicId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<GenerateState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [stage, setStage] = useState<string>("Starting research");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalMs, setFinalMs] = useState<number | null>(null);

  const rafRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  const stopTimers = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (pollRef.current !== null) clearInterval(pollRef.current);
    rafRef.current = null;
    pollRef.current = null;
  }, []);

  // Clean up if the component unmounts mid-generation.
  useEffect(() => stopTimers, [stopTimers]);

  function startTimers() {
    startRef.current = performance.now();
    setElapsedMs(0);
    setFinalMs(null);
    setStage("Starting research");

    const tick = () => {
      setElapsedMs(performance.now() - startRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Poll the generating report's stage written by the pipeline.
    const supabase = createSupabaseBrowserClient();
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("reports")
        .select("status, stage")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ status: string; stage: string | null }>();
      if (data?.status === "generating" && data.stage) {
        setStage(data.stage);
      }
    }, STAGE_POLL_MS);
  }

  async function generate() {
    setState("loading");
    setMessage(null);
    startTimers();

    try {
      const res = await fetch(`/api/topics/${topicId}/generate`, {
        method: "POST",
      });
      const took = performance.now() - startRef.current;
      stopTimers();
      setFinalMs(took);

      if (res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { usage?: ReportUsage }
          | null;
        const cost = formatUsageSummary(body?.usage);
        setState("success");
        setMessage(
          `Update ready in ${formatElapsed(took)}${cost ? ` · ${cost}` : ""}.`,
        );
        router.refresh();
      } else {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setState("error");
        setMessage(
          body?.error ??
            "Could not generate an update. Check your OpenAI configuration and try again.",
        );
      }
    } catch {
      stopTimers();
      setFinalMs(performance.now() - startRef.current);
      setState("error");
      setMessage("Network error while generating the update.");
    }
  }

  return (
    <div className={compact ? "contents" : "flex flex-col gap-2"}>
      {compact ? (
        <button
          type="button"
          onClick={generate}
          disabled={state === "loading"}
          aria-label="Generate a new update for this topic"
          className="inline-flex size-11 items-center justify-center rounded-md border border-rule hover:bg-neutral-100 disabled:opacity-50"
        >
          {state === "loading" ? (
            <Spinner />
          ) : (
            <RefreshCw className="size-5" aria-hidden />
          )}
        </button>
      ) : (
        <Button
          onClick={generate}
          disabled={state === "loading"}
          aria-label="Generate a new update for this topic"
        >
          {state === "loading" ? (
            <>
              <Spinner /> Researching…
            </>
          ) : (
            <>
              <RefreshCw className="size-4" aria-hidden /> Generate Update
            </>
          )}
        </Button>
      )}

      {state === "loading" && (
        /* Sticky above the bottom nav (h-14) so it stays visible while
           scrolling without covering the navigation. */
        <div
          data-no-capture
          className="pointer-events-none fixed inset-x-0 bottom-14 z-40 mx-auto w-full max-w-md px-3 pb-2"
        >
          {/* Inverted against the page — ink background, paper text — so the
              live status reads as an overlay rather than page content. */}
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto rounded-md border border-ink bg-ink px-4 py-3 text-paper shadow-lg"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{stage}…</p>
              <p className="font-mono text-sm tabular-nums text-paper/70">
                {formatElapsed(elapsedMs)}
              </p>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-paper/60">
              Proactive plans queries, searches news → Reddit → Medium,
              extracts and deduplicates findings, then writes your briefing.
              Typically 1–3 minutes.
            </p>
          </div>
        </div>
      )}

      {message && state !== "loading" && (
        <p
          role="status"
          className={clsx(
            "text-xs font-medium",
            // In compact mode the parent is `contents`, so this lands directly
            // in the action row — full width puts it on its own line, and
            // order-first lifts it ABOVE the whole button row.
            compact && "order-first w-full",
            state === "error" ? "text-red-700" : "text-emerald-700",
          )}
        >
          {message}
          {state === "error" && finalMs !== null && (
            <span className="text-ink-faint">
              {" "}
              (after {formatElapsed(finalMs)})
            </span>
          )}
        </p>
      )}
    </div>
  );
}
