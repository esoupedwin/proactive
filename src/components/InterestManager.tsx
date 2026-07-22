"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Interest } from "@/lib/types";

type RowMode = { id: string; mode: "view" | "edit" } | null;

export function InterestManager({
  interests,
  startWithAddForm,
}: {
  interests: Interest[];
  startWithAddForm: boolean;
}) {
  const router = useRouter();
  const [rowMode, setRowMode] = useState<RowMode>(null);
  const [adding, setAdding] = useState(startWithAddForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mutate(
    fn: () => PromiseLike<{ error: { message: string } | null }>
  ) {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      setError(error.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function addInterest(name: string, intent: string) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const ok = await mutate(() =>
      supabase
        .from("interests")
        .insert({ user_id: user.id, name, intent: intent || null })
    );
    if (ok) setAdding(false);
  }

  async function saveInterest(id: string, name: string, intent: string) {
    const supabase = createClient();
    const ok = await mutate(() =>
      supabase
        .from("interests")
        .update({ name, intent: intent || null })
        .eq("id", id)
    );
    if (ok) setRowMode(null);
  }

  async function deleteInterest(interest: Interest) {
    if (
      !confirm(
        `Delete "${interest.name}"? Its cached updates will be removed too.`
      )
    ) {
      return;
    }
    const supabase = createClient();
    await mutate(() =>
      supabase.from("interests").delete().eq("id", interest.id)
    );
  }

  return (
    <div className="flex flex-col">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-foreground/20 border-y border-foreground/20">
        {interests.map((interest) => {
          const mode = rowMode?.id === interest.id ? rowMode.mode : null;
          return (
            <li key={interest.id} className="py-3">
              {mode === "edit" ? (
                <InterestForm
                  initialName={interest.name}
                  initialIntent={interest.intent ?? ""}
                  busy={busy}
                  submitLabel="Save"
                  onSubmit={(name, intent) =>
                    saveInterest(interest.id, name, intent)
                  }
                  onCancel={() => setRowMode(null)}
                />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="grow text-sm font-bold">
                      {interest.name}
                    </span>
                    <IconButton
                      label={`View intent for ${interest.name}`}
                      onClick={() =>
                        setRowMode(
                          mode === "view"
                            ? null
                            : { id: interest.id, mode: "view" }
                        )
                      }
                    >
                      <EyeIcon />
                    </IconButton>
                    <IconButton
                      label={`Edit ${interest.name}`}
                      onClick={() =>
                        setRowMode({ id: interest.id, mode: "edit" })
                      }
                    >
                      <PencilIcon />
                    </IconButton>
                    <IconButton
                      label={`Delete ${interest.name}`}
                      onClick={() => deleteInterest(interest)}
                    >
                      <XIcon />
                    </IconButton>
                  </div>
                  {mode === "view" && (
                    <div className="mt-2 rounded-lg bg-foreground/5 p-3 text-sm">
                      <p className="font-bold">I want to know:</p>
                      <p className="mt-1 whitespace-pre-wrap">
                        {interest.intent || "No description added yet."}
                      </p>
                      <button
                        onClick={() => setRowMode(null)}
                        className="mt-2 text-xs text-foreground/50 underline underline-offset-2"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
        {interests.length === 0 && (
          <li className="py-3 text-sm text-foreground/50">
            No interests yet.
          </li>
        )}
      </ul>

      <div className="mt-4">
        {adding ? (
          <InterestForm
            busy={busy}
            submitLabel="Add"
            onSubmit={addInterest}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg border border-foreground/30 px-4 py-2 text-sm font-medium hover:bg-foreground/5"
          >
            Add Interest
          </button>
        )}
      </div>
    </div>
  );
}

function InterestForm({
  initialName = "",
  initialIntent = "",
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialIntent?: string;
  busy: boolean;
  submitLabel: string;
  onSubmit: (name: string, intent: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [intent, setIntent] = useState(initialIntent);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim(), intent.trim());
      }}
      className="flex flex-col gap-2 rounded-lg border border-foreground/20 p-3"
    >
      <label
        className="font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground/60"
        htmlFor="interest-name"
      >
        Interest
      </label>
      <input
        id="interest-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Latest top LLMs"
        required
        className="rounded-md border border-foreground/25 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/60"
      />
      <label
        className="mt-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground/60"
        htmlFor="interest-intent"
      >
        I want to know:
      </label>
      <textarea
        id="interest-intent"
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        placeholder="What do you want to understand about this topic? This steers the AI's search."
        rows={3}
        className="rounded-md border border-foreground/25 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/60"
      />
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg border border-foreground/30 px-4 py-1.5 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-sm text-foreground/60 hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-full border border-foreground/25 p-1.5 transition-colors hover:bg-foreground/5"
    >
      {children}
    </button>
  );
}

const iconProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function EyeIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
