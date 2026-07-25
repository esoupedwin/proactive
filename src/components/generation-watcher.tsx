"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatElapsed } from "@/lib/reports";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Spinner } from "./ui";

const STAGE_POLL_MS = 1500;

/**
 * Shown when the page loads while a generation is already in flight (e.g.
 * after a refresh). Displays the live pipeline stage and elapsed time since
 * the run started, and reloads the page data the moment the report is done.
 */
export function GenerationWatcher({
  reportId,
  startedAt,
}: {
  reportId: string;
  startedAt: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<string>("Working on the update");
  const [elapsedMs, setElapsedMs] = useState(0);

  const rafRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Elapsed since the run actually started (server timestamp), so the
    // timer survives refreshes. Clamp for minor client/server clock skew.
    const startMs = new Date(startedAt).getTime();

    const tick = () => {
      setElapsedMs(Math.max(0, Date.now() - startMs));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const supabase = createSupabaseBrowserClient();
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("reports")
        .select("status, stage")
        .eq("id", reportId)
        .maybeSingle<{ status: string; stage: string | null }>();
      if (!data) return;
      if (data.status === "generating") {
        if (data.stage) setStage(data.stage);
      } else {
        // Done (ready or error) — stop and pull in the fresh server render.
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        if (pollRef.current !== null) clearInterval(pollRef.current);
        rafRef.current = null;
        pollRef.current = null;
        router.refresh();
      }
    }, STAGE_POLL_MS);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (pollRef.current !== null) clearInterval(pollRef.current);
    };
  }, [reportId, startedAt, router]);

  return (
    /* Sticky above the bottom nav (h-14) so it stays visible while
       scrolling without covering the navigation. */
    <div className="pointer-events-none fixed inset-x-0 bottom-14 z-40 mx-auto w-full max-w-md px-3 pb-2">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto rounded-md border border-rule bg-paper px-4 py-3 shadow-lg"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Spinner className="text-ink-faint" /> {stage}…
          </p>
          <p className="font-mono text-sm tabular-nums text-ink-soft">
            {formatElapsed(elapsedMs)}
          </p>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
          An update is being generated for this topic. The report will appear
          here automatically when it&apos;s ready.
        </p>
      </div>
    </div>
  );
}
