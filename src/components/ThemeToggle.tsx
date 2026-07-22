"use client";

import { useEffect, useState } from "react";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

type Theme = (typeof OPTIONS)[number]["value"];

export function ThemeToggle() {
  // Render as "system" on the server, then read the real value after mount
  // so server and client HTML match.
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
    setMounted(true);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    if (next === "system") {
      localStorage.removeItem("theme");
      delete document.documentElement.dataset.theme;
    } else {
      localStorage.setItem("theme", next);
      document.documentElement.dataset.theme = next;
    }
  }

  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-foreground/30">
      {OPTIONS.map((option, i) => (
        <button
          key={option.value}
          onClick={() => apply(option.value)}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            i > 0 ? "border-l border-foreground/30" : ""
          } ${
            mounted && theme === option.value
              ? "bg-foreground text-background"
              : "hover:bg-foreground/5"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
