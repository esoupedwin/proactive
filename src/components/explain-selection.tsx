"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { ParagraphWithLinkBadges } from "./link-badges";
import { LinkPending } from "./link-pending";
import { Spinner } from "./ui";

/** Selections outside these bounds are misfires, not questions. */
const MIN_SELECTION = 2;
const MAX_SELECTION = 600;
const MAX_CONTEXT = 800;

interface TooltipState {
  top: number;
  left: number;
  text: string;
  context: string;
}

/**
 * Wraps the briefing so highlighting any text inside it offers a floating
 * "Tell me more" action: the selection goes to the topic's explain endpoint
 * (search-tier model, web search at the model's discretion) and the answer
 * opens in a bottom sheet.
 */
export function ExplainSelection({
  topicId,
  children,
}: {
  topicId: string;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [sheet, setSheet] = useState<{ text: string; context: string } | null>(
    null,
  );
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [explanation, setExplanation] = useState("");

  const syncToSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setTooltip(null);
      return;
    }
    const text = selection.toString().trim();
    if (text.length < MIN_SELECTION || text.length > MAX_SELECTION) {
      setTooltip(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setTooltip(null);
      return;
    }

    // The block the selection lives in, as disambiguating context.
    const anchor =
      range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    const block = anchor?.closest("p, li, td, h1, h2, h3, h4, blockquote");
    const context = (block?.textContent ?? "").trim().slice(0, MAX_CONTEXT);

    const rect = range.getBoundingClientRect();
    setTooltip({
      // Above the selection, or below when the selection touches the top edge.
      top: rect.top > 64 ? rect.top - 44 : rect.bottom + 8,
      left: Math.min(
        Math.max(rect.left + rect.width / 2, 72),
        window.innerWidth - 72,
      ),
      text,
      context,
    });
  }, []);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncToSelection);
    };
    document.addEventListener("selectionchange", schedule);
    // Keep the pill glued to the selection while the page scrolls under it.
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, [syncToSelection]);

  async function tellMeMore(text: string, context: string) {
    setTooltip(null);
    setSheet({ text, context });
    setPhase("loading");
    setExplanation("");
    try {
      const res = await fetch(`/api/topics/${topicId}/explain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, context }),
      });
      const body = (await res.json().catch(() => null)) as
        | { explanation?: string }
        | null;
      if (res.ok && body?.explanation) {
        setExplanation(body.explanation);
        setPhase("ready");
      } else {
        setPhase("error");
      }
    } catch {
      setPhase("error");
    }
  }

  return (
    <div ref={containerRef}>
      {children}

      {tooltip && !sheet && (
        <button
          type="button"
          // pointerdown, and prevented, so the tap neither collapses the
          // selection nor re-triggers selectionchange before the click lands.
          onPointerDown={(e) => {
            e.preventDefault();
            void tellMeMore(tooltip.text, tooltip.context);
          }}
          style={{ top: tooltip.top, left: tooltip.left }}
          className="fixed z-50 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-rule bg-ink px-3 py-1.5 text-xs font-semibold text-paper shadow-lg hover:bg-ink-soft"
        >
          <Sparkles className="size-3.5" aria-hidden /> Tell me more
        </button>
      )}

      {sheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tell me more"
          className="fixed inset-0 z-50 mx-auto flex w-full max-w-md flex-col justify-end"
        >
          <button
            aria-label="Close"
            className="absolute inset-0 bg-black/30"
            onClick={() => setSheet(null)}
          />
          <div className="relative flex max-h-[85dvh] flex-col rounded-t-xl border border-rule bg-paper p-5 pb-8">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold">Tell me more</h2>
              <button
                onClick={() => setSheet(null)}
                aria-label="Close"
                className="rounded-md p-2 hover:bg-neutral-100"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <blockquote className="mb-3 shrink-0 border-l-2 border-rule pl-3 text-xs leading-relaxed text-ink-faint">
              {sheet.text.length > 160
                ? `${sheet.text.slice(0, 160)}…`
                : sheet.text}
            </blockquote>

            <div className="min-h-0 overflow-y-auto overscroll-contain">
              {phase === "loading" && (
                <p className="flex items-center gap-2 py-4 text-sm text-ink-faint">
                  <Spinner className="size-4" /> Looking into it…
                </p>
              )}
              {phase === "error" && (
                <p className="py-4 text-sm text-red-700">
                  Could not explain this right now — try again.
                </p>
              )}
              {phase === "ready" &&
                explanation.split(/\n{2,}/).map((paragraph, i) => (
                  <ParagraphWithLinkBadges key={i} text={paragraph} />
                ))}
            </div>

            {/* Every lookup is saved, so the sheet always has somewhere to
                send you once you're done reading this one. */}
            <div className="mt-4 shrink-0 border-t border-rule pt-3">
              <Link
                href="/settings/explanations"
                className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink hover:underline"
              >
                See all your lookups{" "}
                <LinkPending>
                  <ArrowRight className="size-3.5" aria-hidden />
                </LinkPending>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
