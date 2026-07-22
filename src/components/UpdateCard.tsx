"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Interest, Update } from "@/lib/types";

export function UpdateCard({
  interest,
  update,
  pending,
}: {
  interest: Interest;
  update?: Update;
  pending: boolean;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  return (
    <article className={pending ? "animate-pulse opacity-60" : undefined}>
      <h2 className="text-base font-bold underline underline-offset-4">
        Updates on {interest.name}
      </h2>

      {update ? (
        <>
          <div className="prose-sm mt-2 flex flex-col gap-3 text-sm leading-relaxed [&_a]:underline [&_strong]:font-bold">
            <ReactMarkdown>{update.content}</ReactMarkdown>
          </div>

          <div className="mt-3 flex items-center gap-3">
            {update.sources.length > 0 && (
              <button
                onClick={() => setSourcesOpen((v) => !v)}
                className="rounded-md border border-foreground/25 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wider hover:bg-foreground/5"
              >
                {sourcesOpen ? "hide sources" : `sources (${update.sources.length})`}
              </button>
            )}
            <span
              className="font-mono text-[11px] text-foreground/40"
              suppressHydrationWarning
            >
              {new Date(update.fetched_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {update.last_checked_at && (
                <>
                  {" · no new updates as of "}
                  {new Date(update.last_checked_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </>
              )}
            </span>
          </div>

          {sourcesOpen && (
            <ul className="mt-2 flex flex-col gap-1.5 rounded-lg border border-foreground/15 p-3">
              {update.sources.map((s) => (
                <li key={s.url} className="text-xs leading-snug">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground/70"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-foreground/50">
          {pending ? "Fetching…" : "No update fetched yet."}
        </p>
      )}
    </article>
  );
}
