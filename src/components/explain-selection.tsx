"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, TextSelect, X } from "lucide-react";
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

/** Sentence-ending punctuation, with any closing quotes/brackets attached. */
const SENTENCE_END = /[.?!…]["”')\]]*/g;

/** One line of the custom selection highlight, in viewport coordinates. */
interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Client rects merged into one rect per text line, so the painted highlight
 * is a single rounded pill per line instead of a broken run of fragments
 * (inline elements — bold entities, citation superscripts — each contribute
 * their own rect).
 */
function mergeLineRects(rects: DOMRect[]): HighlightRect[] {
  const lines: HighlightRect[] = [];
  for (const rect of rects) {
    if (rect.width < 1 || rect.height < 1) continue;
    const line = lines.find((l) => Math.abs(l.top - rect.top) < 4);
    if (!line) {
      lines.push({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    } else {
      const right = Math.max(line.left + line.width, rect.left + rect.width);
      line.left = Math.min(line.left, rect.left);
      line.width = right - line.left;
      line.height = Math.max(line.height, rect.height);
    }
  }
  return lines;
}

/**
 * Line rects for the selection, built from the TEXT NODES it crosses rather
 * than range.getClientRects(): for multi-element selections the latter also
 * returns whole-element slabs on top of the text lines, which painted entire
 * bullets (gaps, marker column and all) and double-shaded the overlaps.
 * Unselectable text (the bullets' aria-hidden "•" markers) is skipped.
 */
function selectionLineRects(range: Range): HighlightRect[] {
  const root =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  if (!root) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const rects: DOMRect[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    if (!range.intersectsNode(text)) continue;
    const parent = text.parentElement;
    if (parent && getComputedStyle(parent).userSelect === "none") continue;
    const sub = document.createRange();
    sub.selectNodeContents(text);
    if (text === range.startContainer) sub.setStart(text, range.startOffset);
    if (text === range.endContainer) sub.setEnd(text, range.endOffset);
    rects.push(...Array.from(sub.getClientRects()));
  }
  return mergeLineRects(rects);
}

/**
 * Grows the current selection to the full sentence(s) containing it, within
 * its block. Works on the block's text-node stream so the new DOM range lands
 * correctly even across nested markup (bold entities, citation superscripts).
 * A boundary only counts when followed by whitespace or the block's end, so
 * decimals ("53.4") and tight abbreviations don't split a sentence.
 */
function expandSelectionToSentence(maxLength: number): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const anchor =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  const block = anchor?.closest("p, li, td, h1, h2, h3, h4, blockquote");
  if (!block) return;

  // The block's text nodes, in order — both the string we scan and the
  // coordinate system we map back into.
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text);
  }
  if (nodes.length === 0) return;
  const full = nodes.map((t) => t.data).join("");

  // Selection endpoints as offsets into that stream, measured with ranges so
  // element-container endpoints resolve without special cases.
  const measure = (container: Node, offset: number): number => {
    const probe = document.createRange();
    probe.selectNodeContents(block);
    probe.setEnd(container, offset);
    return probe.toString().length;
  };
  const startOffset = measure(range.startContainer, range.startOffset);
  const endOffset = Math.max(
    measure(range.endContainer, range.endOffset),
    startOffset,
  );

  let sentStart = 0;
  let sentEnd = full.length;
  SENTENCE_END.lastIndex = 0;
  for (let m = SENTENCE_END.exec(full); m; m = SENTENCE_END.exec(full)) {
    const end = m.index + m[0].length;
    const next = full[end];
    if (next !== undefined && !/\s/.test(next)) continue;
    if (end <= startOffset) {
      // A boundary before the selection: the sentence starts after it.
      let s = end;
      while (s < full.length && /\s/.test(full[s]!)) s++;
      if (s <= startOffset) sentStart = s;
    } else if (end >= endOffset) {
      sentEnd = end;
      break;
    }
    // Boundaries strictly inside the selection are spanned, not split.
  }
  if (sentEnd - sentStart > maxLength) return;

  // Map stream offsets back onto concrete text nodes.
  const locate = (offset: number): [Text, number] => {
    let acc = 0;
    for (const t of nodes) {
      if (offset <= acc + t.data.length) return [t, offset - acc];
      acc += t.data.length;
    }
    const last = nodes[nodes.length - 1]!;
    return [last, last.data.length];
  };
  const [startNode, start] = locate(sentStart);
  const [endNode, end] = locate(sentEnd);
  const sentence = document.createRange();
  sentence.setStart(startNode, start);
  sentence.setEnd(endNode, end);
  selection.removeAllRanges();
  selection.addRange(sentence);
  // selectionchange now refires and the tooltip re-syncs to the sentence.
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
  const [highlight, setHighlight] = useState<HighlightRect[]>([]);
  const [sheet, setSheet] = useState<{ text: string; context: string } | null>(
    null,
  );
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [explanation, setExplanation] = useState("");

  const syncToSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setTooltip(null);
      setHighlight([]);
      return;
    }
    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setTooltip(null);
      setHighlight([]);
      return;
    }
    // The rounded highlight stands in for the native selection (made
    // transparent in this scope), so it must track EVERY in-container
    // selection — including ones too long for the tooltip.
    setHighlight(selectionLineRects(range));

    const text = selection.toString().trim();
    if (text.length < MIN_SELECTION || text.length > MAX_SELECTION) {
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
        Math.max(rect.left + rect.width / 2, 140),
        window.innerWidth - 140,
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
    <div ref={containerRef} className="rounded-selection">
      {children}

      {/* The hand-painted selection: one rounded pill per line, under the
          text visually (translucent) and inert to the pointer. */}
      {highlight.map((rect, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            top: rect.top - 1,
            left: rect.left - 3,
            width: rect.width + 6,
            height: rect.height + 2,
          }}
          // multiply keeps the text at full contrast beneath the tint, like
          // a real highlighter, instead of frosting it.
          className="pointer-events-none fixed z-0 rounded-md bg-sky-200 mix-blend-multiply"
        />
      ))}

      {tooltip && !sheet && (
        <div
          style={{ top: tooltip.top, left: tooltip.left }}
          className="fixed z-50 flex -translate-x-1/2 items-center gap-1.5"
        >
          <button
            type="button"
            // pointerdown, and prevented, so the tap neither collapses the
            // selection nor re-triggers selectionchange before the click lands.
            onPointerDown={(e) => {
              e.preventDefault();
              void tellMeMore(tooltip.text, tooltip.context);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-ink px-3 py-1.5 text-xs font-semibold text-paper shadow-lg hover:bg-ink-soft"
          >
            <Sparkles className="size-3.5" aria-hidden /> Tell me more
          </button>
          <button
            type="button"
            // Same pointerdown treatment: the tap must not collapse the
            // selection this action is about to grow.
            onPointerDown={(e) => {
              e.preventDefault();
              expandSelectionToSentence(MAX_SELECTION);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper px-3 py-1.5 text-xs font-semibold text-ink shadow-lg hover:bg-neutral-100"
          >
            <TextSelect className="size-3.5" aria-hidden /> Select Sentence
          </button>
        </div>
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
