"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SOURCES, SOURCE_LABELS } from "@/lib/types";

export function TabBar() {
  const pathname = usePathname();
  const onSettings = pathname.startsWith("/settings");

  return (
    <header className="sticky top-0 z-10 bg-background">
      <nav className="flex items-end gap-1 px-3 pt-3">
        {SOURCES.map((source) => {
          const active = pathname === `/${source}`;
          return (
            <Link
              key={source}
              href={`/${source}`}
              className={`rounded-t-lg border px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
                active
                  ? "border-foreground/30 border-b-transparent bg-background"
                  : "border-transparent text-foreground/50 hover:text-foreground"
              }`}
            >
              {SOURCE_LABELS[source]}
            </Link>
          );
        })}
        <div className="grow" />
        <Link
          href="/settings"
          aria-label="Settings"
          className={`mb-1 rounded-full p-2 transition-colors hover:bg-foreground/5 ${
            onSettings ? "text-foreground" : "text-foreground/50"
          }`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </nav>
      <div className="mx-3 -mt-px border-b border-foreground/30" />
    </header>
  );
}
