"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import type { ModelInfo } from "@/lib/ai/model-catalog";

/**
 * A styled combobox for model ids: a free-text input (any id remains valid,
 * catalogued or not) with a filter-as-you-type dropdown, open-on-focus, and
 * keyboard navigation. Replaces the native datalist, whose popup cannot be
 * styled and varies by browser.
 *
 * The option list arrives once via ModelCatalogProvider so four fields on
 * the page do not each serialize a ~400-entry array.
 */

interface ModelCatalogs {
  openai: ModelInfo[];
  openrouter: ModelInfo[];
}

const ModelCatalogContext = createContext<ModelCatalogs>({
  openai: [],
  openrouter: [],
});

/** "$0.085 in · $0.17 out /M", "free", or "" when the catalogue has no price. */
export function formatModelPrice(m: ModelInfo): string {
  if (m.prompt_per_m === null || m.completion_per_m === null) return "";
  if (m.prompt_per_m === 0 && m.completion_per_m === 0) return "free";
  const dollars = (n: number) =>
    "$" + n.toFixed(n < 1 ? 3 : 2).replace(/\.?0+$/, "");
  return `${dollars(m.prompt_per_m)} in · ${dollars(m.completion_per_m)} out /M`;
}

export function ModelCatalogProvider({
  catalogs,
  children,
}: {
  catalogs: ModelCatalogs;
  children: React.ReactNode;
}) {
  return (
    <ModelCatalogContext.Provider value={catalogs}>
      {children}
    </ModelCatalogContext.Provider>
  );
}

/** Keep the popup snappy; past this the user should just keep typing. */
const MAX_SHOWN = 150;

export function ModelCombobox({
  name,
  defaultValue,
  placeholder,
  /** Which platform's catalogue to suggest from. */
  platform,
}: {
  name: string;
  defaultValue: string;
  placeholder: string;
  platform: "openai" | "openrouter";
}) {
  const options = useContext(ModelCatalogContext)[platform];
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const needle = value.trim().toLowerCase();
    const all = needle
      ? options.filter((m) => m.id.toLowerCase().includes(needle))
      : options;
    return { shown: all.slice(0, MAX_SHOWN), total: all.length };
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the active row visible while arrowing through the list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const canSuggest = options.length > 0;

  function choose(id: string) {
    setValue(id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!canSuggest) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) =>
        Math.min(Math.max(a + delta, 0), matches.shown.length - 1),
      );
    } else if (e.key === "Enter") {
      if (open && matches.shown[active]) {
        e.preventDefault();
        choose(matches.shown[active]!.id);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        name={name}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (canSuggest) {
            setOpen(true);
            setActive(0);
          }
        }}
        onFocus={() => canSuggest && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="min-h-11 w-full rounded-md border border-rule bg-paper px-3 pr-9 text-sm text-ink focus:border-ink focus:outline-none"
      />
      {canSuggest && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Close model list" : "Open model list"}
          onClick={() => setOpen(!open)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-faint hover:text-ink"
        >
          <ChevronDown
            className={clsx("size-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      )}

      {open && canSuggest && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-rule bg-paper shadow-lg">
          {matches.total === 0 ? (
            <p className="px-3 py-2.5 text-sm text-ink-faint">
              No catalogued model matches — a new or private id still works.
            </p>
          ) : (
            <ul
              ref={listRef}
              role="listbox"
              className="max-h-64 overflow-y-auto overscroll-contain py-1"
            >
              {matches.shown.map((m, i) => (
                <li key={m.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    data-active={i === active}
                    // pointerdown beats the input blur; click would race it.
                    onPointerDown={(e) => {
                      e.preventDefault();
                      choose(m.id);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={clsx(
                      "w-full px-3 py-2 text-left",
                      i === active && "bg-neutral-100",
                    )}
                  >
                    <span className="block truncate text-sm">{m.id}</span>
                    {formatModelPrice(m) && (
                      <span className="block text-xs text-ink-faint">
                        {formatModelPrice(m)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {matches.total > MAX_SHOWN && (
                <li className="px-3 py-2 text-xs text-ink-faint">
                  …and {matches.total - MAX_SHOWN} more — keep typing to narrow.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
