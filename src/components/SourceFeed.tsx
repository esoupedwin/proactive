"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Interest, Source, Update } from "@/lib/types";
import { UpdateCard } from "@/components/UpdateCard";
import { SpaceInvaderLoader } from "@/components/SpaceInvaderLoader";

interface FetchResultRow {
  interestId: string;
  name: string;
  ok: boolean;
  error?: string;
}

// Wall-clock run time per interest: starts on its first status, stops on its result.
interface Timer {
  start: number;
  end?: number;
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function SourceFeed({
  source,
  interests,
  updates,
}: {
  source: Source;
  interests: Interest[];
  updates: Update[];
}) {
  const router = useRouter();
  const [fetching, setFetching] = useState(false);
  const [failures, setFailures] = useState<FetchResultRow[]>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [timers, setTimers] = useState<Record<string, Timer>>({});
  const [now, setNow] = useState(0);

  // Drive the visible seconds counter only while a fetch is in flight.
  useEffect(() => {
    if (!fetching) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fetching]);

  const updatesByInterest = new Map(updates.map((u) => [u.interest_id, u]));
  const hasUpdates = updates.length > 0;

  async function fetchLatest() {
    setFetching(true);
    setFailures([]);
    setFatalError(null);
    setStatuses({});
    setTimers({});
    setNow(Date.now());
    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });

      if (!res.ok || !res.body) {
        // Error responses are plain JSON, not a stream.
        const json = await res.json().catch(() => null);
        setFatalError(json?.error ?? `Fetch failed (HTTP ${res.status})`);
        return;
      }

      // Read the NDJSON status stream.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === "status") {
          setStatuses((prev) => ({ ...prev, [event.interestId]: event.message }));
          setTimers((prev) =>
            prev[event.interestId]
              ? prev
              : { ...prev, [event.interestId]: { start: Date.now() } }
          );
        } else if (event.type === "result") {
          setTimers((prev) => {
            const timer = prev[event.interestId] ?? { start: Date.now() };
            return { ...prev, [event.interestId]: { ...timer, end: Date.now() } };
          });
          setStatuses((prev) => ({
            ...prev,
            [event.interestId]: !event.ok
              ? `Failed: ${event.error}`
              : event.noChange
                ? "No new updates since last fetch ✓"
                : `Done ✓${
                    event.memoriesAdded
                      ? ` — remembered ${event.memoriesAdded} new key point${
                          event.memoriesAdded > 1 ? "s" : ""
                        }`
                      : ""
                  }`,
          }));
        } else if (event.type === "done") {
          setFailures(
            (event.results as FetchResultRow[]).filter((r) => !r.ok)
          );
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        lines.forEach(handleLine);
      }
      handleLine(buffer);

      router.refresh();
    } catch {
      setFatalError("Network error — please try again.");
    } finally {
      setFetching(false);
      setStatuses({});
      setTimers({});
    }
  }

  if (interests.length === 0) {
    return (
      <div className="flex grow flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-foreground/60">
          No interests yet. Add topics you want to stay updated on.
        </p>
        <Link
          href="/settings/interests?add=1"
          className="rounded-lg border border-foreground/30 px-4 py-2 text-sm font-medium hover:bg-foreground/5"
        >
          Add Interest
        </Link>
      </div>
    );
  }

  const statusContent =
    Object.keys(statuses).length > 0 ? (
      <ul className="flex flex-col gap-1">
        {interests
          .filter((i) => statuses[i.id])
          .map((i) => {
            const timer = timers[i.id];
            return (
              <li key={i.id} className="text-xs text-foreground/50">
                {timer && (
                  <span className="mr-1.5 font-mono tabular-nums text-foreground/40">
                    {formatElapsed((timer.end ?? now) - timer.start)}
                  </span>
                )}
                <span className="font-semibold">{i.name}</span> — {statuses[i.id]}
              </li>
            );
          })}
      </ul>
    ) : (
      <p className="text-xs text-foreground/50">Starting fetch…</p>
    );

  const statusList = fetching ? (
    <div className="flex flex-col gap-2">
      <SpaceInvaderLoader />
      {statusContent}
    </div>
  ) : null;

  const fetchButton = hasUpdates ? (
    <button
      onClick={fetchLatest}
      disabled={fetching}
      aria-label="Re-fetch updates"
      title="Re-fetch updates"
      className="rounded-lg border border-foreground/30 p-2.5 transition-colors hover:bg-foreground/5 disabled:opacity-50"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={fetching ? "animate-spin" : undefined}
        aria-hidden
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <polyline points="21 3 21 9 15 9" />
      </svg>
    </button>
  ) : (
    <button
      onClick={fetchLatest}
      disabled={fetching}
      className="rounded-lg border border-foreground/30 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:opacity-50"
    >
      {fetching ? "Fetching…" : "Fetch Latest"}
    </button>
  );

  if (!hasUpdates) {
    return (
      <div className="flex grow flex-col items-center justify-center gap-3">
        {fetchButton}
        {statusList}
        {fatalError && <p className="text-sm text-red-600">{fatalError}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-2">
        {fetchButton}
        {statusList}
        {fatalError && <p className="text-sm text-red-600">{fatalError}</p>}
        {failures.length > 0 && (
          <p className="text-sm text-red-600">
            Failed to update: {failures.map((f) => f.name).join(", ")}
          </p>
        )}
      </div>

      {interests.map((interest) => (
        <UpdateCard
          key={interest.id}
          interest={interest}
          update={updatesByInterest.get(interest.id)}
          pending={fetching}
        />
      ))}
    </div>
  );
}
