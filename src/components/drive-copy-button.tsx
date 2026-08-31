"use client";

import { useRef, useState } from "react";
import { Car, Check, Copy, X } from "lucide-react";
import { Spinner } from "./ui";

export interface DriveTopic {
  id: string;
  title: string;
  /** Only topics with a ready report can be narrated. */
  hasReport: boolean;
}

/**
 * "Narrate on the drive" — pick topics, build one combined spoken script of
 * their current briefings (server action), and copy it to the clipboard to
 * paste into a voice assistant (e.g. ChatGPT) for hands-free listening.
 */
export function DriveCopyButton({
  topics,
  buildScript,
}: {
  topics: DriveTopic[];
  buildScript: (topicIds: string[]) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  // Everything narratable starts selected — one tap to take the whole stack.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(topics.filter((t) => t.hasReport).map((t) => t.id)),
  );
  const [phase, setPhase] = useState<"idle" | "building" | "ready" | "error">(
    "idle",
  );
  const [script, setScript] = useState("");
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // The script no longer matches the selection; ask for a rebuild.
    setPhase("idle");
    setScript("");
  }

  async function build() {
    setPhase("building");
    try {
      const result = await buildScript([...selected]);
      if (result) {
        setScript(result);
        setPhase("ready");
      } else {
        setPhase("error");
      }
    } catch {
      setPhase("error");
    }
  }

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
        aria-label="Narrate briefings on the drive"
        title="Narrate briefings on the drive"
        className="inline-flex size-11 items-center justify-center rounded-md border border-rule hover:bg-neutral-100"
      >
        <Car className="size-5" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Narrate briefings on the drive"
          className="fixed inset-0 z-50 mx-auto flex w-full max-w-md flex-col justify-end"
        >
          <button
            aria-label="Close"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex max-h-[85dvh] flex-col rounded-t-xl border border-rule bg-paper p-5 pb-8">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold">Narrate on the drive</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-2 hover:bg-neutral-100"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-ink-faint">
              Pick the topics to hear, copy the script, and paste it into
              ChatGPT — its voice mode will read your briefings aloud while
              you drive.
            </p>

            <ul className="max-h-[30dvh] shrink-0 space-y-1 overflow-y-auto overscroll-contain">
              {topics.map((topic) => (
                <li key={topic.id}>
                  <label
                    className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm ${
                      topic.hasReport
                        ? "hover:bg-neutral-100"
                        : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0"
                      disabled={!topic.hasReport}
                      checked={selected.has(topic.id)}
                      onChange={() => toggle(topic.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {topic.title}
                    </span>
                    {!topic.hasReport && (
                      <span className="shrink-0 text-xs text-ink-faint">
                        No report yet
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>

            {phase === "error" && (
              <p className="mt-2 text-xs text-red-700">
                Could not build the script — check the selection and try again.
              </p>
            )}

            {phase === "ready" ? (
              <>
                <textarea
                  ref={textRef}
                  readOnly
                  value={script}
                  aria-label="Drive narration script"
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-3 min-h-[25dvh] flex-1 resize-none rounded-md border border-rule bg-neutral-50 px-3 py-2.5 text-sm leading-relaxed text-ink-soft focus:border-ink focus:outline-none"
                />
                <button
                  type="button"
                  onClick={copy}
                  className="mt-3 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-paper hover:bg-ink-soft"
                >
                  {copied ? (
                    <>
                      <Check className="size-4" aria-hidden /> Copied — paste
                      into ChatGPT
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" aria-hidden /> Copy script
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={build}
                disabled={selected.size === 0 || phase === "building"}
                className="mt-3 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-paper hover:bg-ink-soft disabled:opacity-50"
              >
                {phase === "building" ? (
                  <>
                    <Spinner className="size-4" /> Building script…
                  </>
                ) : (
                  <>
                    Build script for {selected.size} topic
                    {selected.size === 1 ? "" : "s"}
                  </>
                )}
              </button>
            )}
            <p role="status" className="sr-only">
              {copied ? "Script copied to clipboard" : ""}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
