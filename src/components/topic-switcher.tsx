"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Check, ChevronsUpDown } from "lucide-react";

export interface SwitcherTopic {
  id: string;
  title: string;
}

/**
 * The current topic's title in the bottom bar, doubling as a switcher: tap it
 * for a scrollable list of every topic. Opens upward, since the bar is pinned
 * to the bottom of the viewport.
 */
export function TopicSwitcher({
  topics,
  current,
}: {
  topics: SwitcherTopic[];
  current?: SwitcherTopic;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // With a long list the current topic can open off-screen; bring it into view.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-current="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open]);

  // A single topic has nothing to switch to — stay a plain label.
  if (topics.length < 2) {
    return (
      <span className="min-w-0 truncate text-sm font-semibold">
        {current?.title ?? ""}
      </span>
    );
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Switch topic. Current: ${current?.title ?? "none"}`}
        className="flex min-w-0 items-center gap-1 rounded-md px-2 py-1.5 hover:bg-neutral-100"
      >
        <span className="min-w-0 truncate text-sm font-semibold">
          {current?.title ?? ""}
        </span>
        <ChevronsUpDown
          className="size-3.5 shrink-0 text-ink-faint"
          aria-hidden
        />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-64 max-w-[85vw] overflow-hidden rounded-md border border-rule bg-paper shadow-lg">
          <p className="border-b border-rule px-3 py-2 text-[11px] uppercase tracking-wide text-ink-faint">
            Switch topic
          </p>
          <ul
            ref={listRef}
            role="menu"
            className="max-h-64 overflow-y-auto overscroll-contain py-1"
          >
            {topics.map((topic) => {
              const isCurrent = topic.id === current?.id;
              return (
                <li key={topic.id} role="none">
                  <Link
                    role="menuitem"
                    href={`/topics/${topic.id}`}
                    data-current={isCurrent}
                    aria-current={isCurrent ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={clsx(
                      "flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-neutral-100",
                      isCurrent && "font-semibold",
                    )}
                  >
                    <Check
                      aria-hidden
                      className={clsx(
                        "size-3.5 shrink-0",
                        isCurrent ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 truncate">{topic.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
