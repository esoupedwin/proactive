"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { GenerationToast } from "./generation-toast";

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
    <GenerationToast stage={stage} elapsedMs={elapsedMs}>
      An update is being generated for this topic. The report will appear here
      automatically when it&apos;s ready.
    </GenerationToast>
  );
}
