"use client";

import { useEffect, useId, useState } from "react";
import { Info, X } from "lucide-react";

/**
 * Field-purpose help: the ⓘ icon beside a label opens a small centered
 * modal explaining what the field is for, dismissed via the close button,
 * the backdrop, or Escape.
 */
export function FieldInfo({ label, text }: { label?: string; text: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ? `About “${label}”` : "About this field"}
        className="ml-1 rounded-full p-1 text-ink-faint hover:bg-neutral-100 hover:text-ink"
      >
        <Info className="size-3.5" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 mx-auto flex w-full max-w-md items-center justify-center p-6"
        >
          <button
            aria-label="Close"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full rounded-md border border-rule bg-paper p-5 shadow-lg">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-sm font-bold">
                {label ?? "About this field"}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-m-1.5 rounded-md p-1.5 text-ink-soft hover:bg-neutral-100 hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-ink-soft">{text}</p>
          </div>
        </div>
      )}
    </>
  );
}
