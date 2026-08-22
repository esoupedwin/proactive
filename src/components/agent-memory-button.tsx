"use client";

import { useEffect, useState } from "react";
import { Brain, Pencil, Trash2, X } from "lucide-react";
import {
  clearTopicFacts,
  deleteTopicFact,
  updateTopicFact,
} from "@/lib/actions";
import { formatDateTime } from "@/lib/reports";
import type { AgentStateData, KnowledgeFact } from "@/lib/types";
import { SubmitButton } from "./submit-button";
import { Input } from "./ui";

/**
 * Shows what the two agents currently remember about this topic:
 * the Info Tracker's active subtopics and the Reporter's subtopics +
 * "where it stopped" cursor. Data is fetched server-side by the page.
 */
export function AgentMemoryButton({
  topicId,
  tracker,
  reporter,
  facts = null,
}: {
  topicId: string;
  tracker: AgentStateData | null;
  reporter: AgentStateData | null;
  /** Question topics: the Reporter's standing facts. Null for other modes. */
  facts?: KnowledgeFact[] | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const empty = !tracker && !reporter && !facts?.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="View the agents' memory for this topic"
        title="View the agents' memory for this topic"
        className="inline-flex size-11 items-center justify-center rounded-md border border-rule hover:bg-neutral-100"
      >
        <Brain className="size-5" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Agent memory"
          className="fixed inset-0 z-50 mx-auto flex w-full max-w-md items-center justify-center p-4"
        >
          <button
            aria-label="Close"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex max-h-[85dvh] w-full flex-col rounded-md border border-rule bg-paper shadow-lg">
            <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold">Agent memory</h2>
                <p className="mt-0.5 text-xs text-ink-faint">
                  What each agent carries into its next run.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-m-1.5 shrink-0 rounded-md p-1.5 text-ink-soft hover:bg-neutral-100 hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-3">
              {empty ? (
                <p className="py-8 text-center text-sm text-ink-faint">
                  No memory yet — the agents build it as they run. Generate an
                  update to get started.
                </p>
              ) : (
                <div className="space-y-5">
                  <MemorySection
                    title="Info Tracker"
                    description="Finds and records what's new."
                    state={tracker}
                  />
                  <MemorySection
                    title="Reporter"
                    description="Assesses extracts and writes your briefings."
                    state={reporter}
                    showCursor
                  />
                  {facts !== null && (
                    <FactsSection topicId={topicId} facts={facts} />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The Reporter's standing facts for a question topic, with a way to fix a
 * wrong one. Editing is per row; the agent owns these but a bad seat count
 * would skew every verdict until corrected.
 */
function FactsSection({
  topicId,
  facts,
}: {
  topicId: string;
  facts: KnowledgeFact[];
}) {
  const [editing, setEditing] = useState<number | null>(null);

  // Close the editor once the save lands (the page re-renders with new facts).
  useEffect(() => setEditing(null), [facts]);

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
        Standing facts
      </h3>
      <p className="mt-0.5 text-xs text-ink-faint">
        What the outcome requires and where things stand — established once
        by a web search, then revised only from report evidence.
      </p>

      {facts.length === 0 ? (
        <p className="mt-2 text-sm text-ink-faint">
          None yet — the next report establishes them.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-rule">
          {facts.map((fact, index) =>
            editing === index ? (
              <li key={index} className="py-2">
                <form
                  action={updateTopicFact.bind(null, topicId, index)}
                  className="space-y-2"
                >
                  <Input
                    name="fact"
                    defaultValue={fact.fact}
                    maxLength={300}
                    aria-label="Fact"
                    autoFocus
                  />
                  {(fact.kind ?? "state") === "state" && (
                    <Input
                      name="as_of"
                      type="date"
                      defaultValue={fact.as_of ?? ""}
                      aria-label="As of date"
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <SubmitButton variant="outline" pendingLabel="Saving…">
                      Save
                    </SubmitButton>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="min-h-9 rounded-md px-3 text-sm text-ink-soft hover:bg-neutral-100"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={index} className="flex items-start gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 leading-relaxed">
                  <span className="mr-1.5 rounded-full border border-rule bg-neutral-50 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                    {fact.kind ?? "state"}
                  </span>
                  {fact.fact}
                  {fact.as_of && (
                    <span className="ml-1 text-xs text-ink-faint">
                      as of {fact.as_of}
                    </span>
                  )}
                  {fact.confidence !== "high" && (
                    <span className="ml-1 text-xs text-ink-faint">
                      · {fact.confidence} confidence
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(index)}
                  aria-label="Edit fact"
                  title="Edit"
                  className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-neutral-100 hover:text-ink"
                >
                  <Pencil className="size-3.5" aria-hidden />
                </button>
                <form action={deleteTopicFact.bind(null, topicId, index)}>
                  <button
                    type="submit"
                    aria-label="Delete fact"
                    title="Delete"
                    className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-neutral-100 hover:text-red-700"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </form>
              </li>
            ),
          )}
        </ul>
      )}

      {facts.length > 0 && (
        <form action={clearTopicFacts.bind(null, topicId)} className="mt-3">
          <SubmitButton
            variant="ghost"
            pendingLabel="Clearing…"
            confirm="Clear all standing facts? The next report will search the web again to re-establish them."
          >
            Re-establish on next report
          </SubmitButton>
        </form>
      )}
    </section>
  );
}

function MemorySection({
  title,
  description,
  state,
  showCursor = false,
}: {
  title: string;
  description: string;
  state: AgentStateData | null;
  showCursor?: boolean;
}) {
  const subtopics = state?.recent_subtopics ?? [];
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {title}
      </h3>
      <p className="mt-0.5 text-xs text-ink-faint">{description}</p>

      {!state ? (
        <p className="mt-2 text-sm text-ink-faint">
          Hasn&apos;t run for this topic yet.
        </p>
      ) : (
        <dl className="mt-2 space-y-2 text-sm">
          <div>
            <dt className="text-xs text-ink-faint">Active subtopics</dt>
            <dd className="mt-1">
              {subtopics.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {subtopics.map((subtopic) => (
                    <li
                      key={subtopic}
                      className="rounded-full border border-rule bg-neutral-50 px-2.5 py-1 text-xs"
                    >
                      {subtopic}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink-faint">None recorded yet.</span>
              )}
            </dd>
          </div>

          {showCursor && (
            <div>
              <dt className="text-xs text-ink-faint">Where it stopped</dt>
              <dd className="mt-0.5">
                {state.cursor ? (
                  <>Processed extracts up to {formatDateTime(state.cursor)}.</>
                ) : (
                  <span className="text-ink-faint">
                    Hasn&apos;t processed any extracts yet.
                  </span>
                )}
              </dd>
            </div>
          )}

          {state.last_run_at && (
            <div>
              <dt className="text-xs text-ink-faint">Last run</dt>
              <dd className="mt-0.5">{formatDateTime(state.last_run_at)}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
