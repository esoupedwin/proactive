"use client";

import { useState, type ReactNode } from "react";

export interface PromptFlowTab {
  key: string;
  label: string;
  count: number;
  content: ReactNode;
}

/**
 * Sub-tabs for the prompt flow page — one per agent. Content is rendered
 * server-side and passed in; this component only switches between panels.
 */
export function PromptFlowTabs({ tabs }: { tabs: PromptFlowTab[] }) {
  // Default to the first tab that actually has calls.
  const [active, setActive] = useState(
    () => (tabs.find((t) => t.count > 0) ?? tabs[0])?.key,
  );

  return (
    <div>
      <div
        role="tablist"
        aria-label="Agent"
        className="mb-5 flex items-center gap-1 rounded-md border border-rule bg-neutral-50 p-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={`flex-1 rounded px-3 py-2 text-sm font-medium ${
              active === tab.key
                ? "bg-paper shadow-sm"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-ink-faint">{tab.count}</span>
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          hidden={active !== tab.key}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
