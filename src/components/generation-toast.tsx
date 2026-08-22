import type { ReactNode } from "react";
import { formatElapsed } from "@/lib/reports";
import { Spinner } from "./ui";

/**
 * Live generation status card: the current pipeline stage, a running
 * elapsed timer, and a short explanation. Used both by the Generate button
 * (for a run it started) and the generation watcher (for a run already in
 * flight when the page loaded) — the same status from different entry
 * points, so it is one component rather than two copies.
 */
export function GenerationToast({
  stage,
  elapsedMs,
  children,
}: {
  stage: string;
  elapsedMs: number;
  children: ReactNode;
}) {
  return (
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
          <p className="flex items-center gap-2 text-sm font-medium">
            <Spinner className="text-paper/70" /> {stage}…
          </p>
          <p className="font-mono text-sm tabular-nums text-paper/70">
            {formatElapsed(elapsedMs)}
          </p>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-paper/60">
          {children}
        </p>
      </div>
    </div>
  );
}
