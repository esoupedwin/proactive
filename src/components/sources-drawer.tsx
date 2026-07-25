"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Source, SourceType } from "@/lib/types";
import { Button } from "./ui";

const GROUPS: Array<{ type: SourceType; label: string }> = [
  { type: "news", label: "News" },
  { type: "reddit", label: "Reddit" },
  { type: "medium", label: "Medium" },
];

/** Bottom drawer listing a report's sources grouped by channel. */
export function SourcesDrawer({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);

  if (sources.length === 0) return null;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Sources ({sources.length})
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report sources"
          className="fixed inset-0 z-50 mx-auto flex w-full max-w-md flex-col justify-end"
        >
          <button
            aria-label="Close sources"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative max-h-[80dvh] overflow-y-auto rounded-t-xl border border-rule bg-paper p-5 pb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Sources</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-2 hover:bg-neutral-100"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {GROUPS.map(({ type, label }) => {
              const group = sources.filter((s) => s.source_type === type);
              if (group.length === 0) return null;
              return (
                <section key={type} aria-label={label} className="mb-5">
                  <h3 className="mb-2 border-b border-rule pb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
                    {label}
                  </h3>
                  <ul className="space-y-3">
                    {group.map((source) => {
                      const index = sources.indexOf(source);
                      return (
                        <li key={source.id} className="text-sm">
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold leading-snug hover:underline"
                          >
                            <span className="mr-1 text-xs text-ink-faint">
                              [{index + 1}]
                            </span>
                            {source.title}
                          </a>
                          <p className="mt-0.5 text-xs text-ink-faint">
                            {[source.publisher, source.published_at]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          <p className="mt-1 leading-relaxed text-ink-soft">
                            {source.gist}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
