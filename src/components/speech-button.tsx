"use client";

import { useRef, useState } from "react";
import { Check, Copy, MessageSquare, X } from "lucide-react";

/**
 * Shows the briefing as a plain-text script to paste into a text-to-speech app
 * (e.g. ChatGPT) and listen to hands-free. The script is built on the server —
 * this component only presents and copies it.
 */
export function SpeechButton({ script }: { script: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API needs a secure context and permission; selecting the
      // text lets the user copy manually instead of hitting a dead button.
      textRef.current?.focus();
      textRef.current?.select();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Get a spoken version of this briefing"
        className="inline-flex size-11 items-center justify-center rounded-md border border-rule hover:bg-neutral-100"
      >
        <MessageSquare className="size-5" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Speech script"
          className="fixed inset-0 z-50 mx-auto flex w-full max-w-md flex-col justify-end"
        >
          <button
            aria-label="Close speech script"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex max-h-[85dvh] flex-col rounded-t-xl border border-rule bg-paper p-5 pb-8">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold">Listen to this briefing</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-2 hover:bg-neutral-100"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-ink-faint">
              Copy this and paste it into ChatGPT, then ask it to read aloud.
            </p>

            <textarea
              ref={textRef}
              readOnly
              value={script}
              aria-label="Speech script"
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-0 flex-1 resize-none rounded-md border border-rule bg-neutral-50 px-3 py-2.5 text-sm leading-relaxed text-ink-soft focus:border-ink focus:outline-none"
            />

            <button
              type="button"
              onClick={copy}
              className="mt-3 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-paper hover:bg-ink-soft"
            >
              {copied ? (
                <>
                  <Check className="size-4" aria-hidden /> Copied
                </>
              ) : (
                <>
                  <Copy className="size-4" aria-hidden /> Copy script
                </>
              )}
            </button>
            <p role="status" className="sr-only">
              {copied ? "Script copied to clipboard" : ""}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
