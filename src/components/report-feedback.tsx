"use client";

import { useState, useTransition } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { submitReportFeedback } from "@/lib/actions";
import type { FeedbackRating } from "@/lib/types";

/**
 * Thumbs + optional comment on a report. The Reporter agent reads recent
 * feedback on its next run and adjusts emphasis/format accordingly.
 */
export function ReportFeedback({
  reportId,
  initialRating,
  initialComment,
}: {
  reportId: string;
  initialRating: FeedbackRating | null;
  initialComment: string | null;
}) {
  const [rating, setRating] = useState<FeedbackRating | null>(initialRating);
  const [comment, setComment] = useState(initialComment ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const rate = (value: FeedbackRating) => {
    setRating(value);
    setSaved(false);
    startTransition(async () => {
      await submitReportFeedback(reportId, value, comment || undefined);
      setSaved(true);
    });
  };

  const saveComment = () => {
    if (!rating) return;
    startTransition(async () => {
      await submitReportFeedback(reportId, rating, comment || undefined);
      setSaved(true);
    });
  };

  const buttonClass = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium ${
      active
        ? "border-ink bg-ink text-white"
        : "border-rule hover:bg-neutral-100"
    }`;

  return (
    <section
      data-no-capture
      aria-label="Report feedback"
      className="mt-6 rounded-md border border-rule bg-neutral-50 px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-soft">Was this briefing useful?</span>
        <button
          type="button"
          onClick={() => rate("up")}
          disabled={pending}
          aria-pressed={rating === "up"}
          className={buttonClass(rating === "up")}
        >
          <ThumbsUp className="size-4" aria-hidden /> Yes
        </button>
        <button
          type="button"
          onClick={() => rate("down")}
          disabled={pending}
          aria-pressed={rating === "down"}
          className={buttonClass(rating === "down")}
        >
          <ThumbsDown className="size-4" aria-hidden /> No
        </button>
        {saved && (
          <span className="text-xs text-ink-faint">
            Noted — the next report will take this into account.
          </span>
        )}
      </div>

      {rating && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={
              rating === "down"
                ? "What should change? (e.g. too long, wrong focus, missed a story)"
                : "Anything to keep doing? (optional)"
            }
            className="w-full rounded-md border border-rule bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={saveComment}
            disabled={pending}
            className="self-start rounded-md border border-rule px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Send feedback"}
          </button>
        </div>
      )}
    </section>
  );
}
