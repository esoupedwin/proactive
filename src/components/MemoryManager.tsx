"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SOURCE_LABELS, type Interest, type Memory } from "@/lib/types";

export function MemoryManager({
  interests,
  memories,
}: {
  interests: Interest[];
  memories: Memory[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byInterest = new Map<string, Memory[]>();
  for (const memory of memories) {
    const list = byInterest.get(memory.interest_id) ?? [];
    list.push(memory);
    byInterest.set(memory.interest_id, list);
  }

  async function forget(ids: string[]) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.from("memories").delete().in("id", ids);
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      router.refresh();
    }
  }

  if (memories.length === 0) {
    return (
      <p className="border-y border-foreground/20 py-4 text-sm text-foreground/50">
        No memories yet — they build up automatically each time you fetch
        updates.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {interests
        .filter((interest) => byInterest.has(interest.id))
        .map((interest) => {
          const items = byInterest.get(interest.id)!;
          return (
            <section key={interest.id}>
              <div className="flex items-center justify-between border-b border-foreground/20 pb-1">
                <h2 className="text-sm font-bold">{interest.name}</h2>
                <button
                  onClick={() => {
                    if (
                      confirm(`Forget all ${items.length} memories for "${interest.name}"?`)
                    ) {
                      forget(items.map((m) => m.id));
                    }
                  }}
                  disabled={busy}
                  className="font-mono text-[11px] uppercase tracking-wider text-foreground/40 underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                >
                  Forget all
                </button>
              </div>
              <ul className="divide-y divide-foreground/10">
                {items.map((memory) => (
                  <li key={memory.id} className="flex items-start gap-2 py-2.5">
                    <div className="grow">
                      <p className="text-sm leading-snug">{memory.content}</p>
                      <p
                        className="mt-1 font-mono text-[10px] uppercase tracking-wider text-foreground/40"
                        suppressHydrationWarning
                      >
                        {SOURCE_LABELS[memory.source]} ·{" "}
                        {new Date(memory.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => forget([memory.id])}
                      disabled={busy}
                      aria-label="Forget this memory"
                      title="Forget this memory"
                      className="mt-0.5 rounded-full border border-foreground/25 p-1 transition-colors hover:bg-foreground/5 disabled:opacity-50"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
    </div>
  );
}
