"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";

/**
 * "About Proactive" — version, stack and system design. Content is static;
 * the version is passed in so package.json stays out of the client bundle.
 */

const STACK: { label: string; value: string }[] = [
  { label: "Framework", value: "Next.js 15 (App Router) · React 19" },
  { label: "Language", value: "TypeScript, strict" },
  { label: "Styling", value: "Tailwind CSS 4" },
  { label: "Data", value: "Supabase — Postgres, Google auth, row-level security" },
  { label: "AI", value: "OpenAI Agents SDK · Responses API · embeddings" },
  { label: "Search", value: "Exa, plus hosted web search" },
  { label: "Hosting", value: "Vercel — daily report cron; Supabase pg_cron drives the tracker" },
  { label: "Tests", value: "Vitest" },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 border-b border-rule pb-1 text-xs font-bold uppercase tracking-wide">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function InfoButton({ version }: { version: string }) {
  const [open, setOpen] = useState(false);

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
        aria-label="About Proactive"
        title="About Proactive"
        className="rounded-md p-2.5 hover:bg-neutral-100"
      >
        <Info className="size-5" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="About Proactive"
          className="fixed inset-0 z-50 mx-auto flex w-full max-w-md flex-col justify-end"
        >
          <button
            aria-label="Close"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative max-h-[85dvh] overflow-y-auto rounded-t-xl border border-rule bg-paper p-5 pb-8 text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Proactive</h2>
                <p className="mt-0.5 text-xs text-ink-faint">
                  Version {version}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-mt-1 rounded-md p-2 hover:bg-neutral-100"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              A personal research companion. It tracks the topics you care
              about, remembers what you have already been told, and reports
              only what changed.
            </p>

            <Section title="How it works">
              <div className="space-y-3 text-sm leading-relaxed text-ink-soft">
                <p>
                  <span className="font-semibold text-ink">Info Tracker</span>{" "}
                  runs on its own schedule, searching for developments and
                  writing what it finds into a lasting store — each entry judged
                  for novelty against everything recorded before, with repeat
                  coverage merged into a corroboration count and disagreements
                  between sources flagged.
                </p>
                <p>
                  <span className="font-semibold text-ink">Reporter</span> runs
                  when an update is due. It reads what the tracker has gathered
                  since the last briefing, picks up from where it stopped, and
                  writes the report. Every claim cites a stored source; anything
                  citing a source that does not exist is dropped.
                </p>
                <p>
                  <span className="font-semibold text-ink">Experts</span> —
                  Mentor and Analyst — read a finished report and add their own
                  layer: concepts and entities worth understanding, or a neutral
                  read on what it means and what to watch. They skip reports
                  where nothing meaningful changed.
                </p>
                <p>
                  Because gathering and writing are separate, evidence keeps
                  accumulating between briefings rather than being re-fetched
                  each time.
                </p>
              </div>
            </Section>

            <Section title="Memory">
              <p className="text-sm leading-relaxed text-ink-soft">
                Each topic carries what it has been told, the facts and open
                questions built up over time, each agent&apos;s own state, and
                what the Mentor has already taught — so nothing is explained or
                reported twice.
              </p>
            </Section>

            <Section title="Built with">
              <dl className="space-y-2 text-sm">
                {STACK.map(({ label, value }) => (
                  <div key={label} className="flex gap-3">
                    <dt className="w-24 shrink-0 text-ink-faint">{label}</dt>
                    <dd className="min-w-0 flex-1 text-ink-soft">{value}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
