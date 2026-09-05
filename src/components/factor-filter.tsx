"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { LoadingAnnouncement, SkeletonExtractList } from "./skeleton";
import { Select } from "./ui";

/** One choice in the filter dropdown. */
export interface FactorFilterOption {
  /** Stable key; also the query value this choice navigates to. */
  value: string;
  label: string;
  /** How many rows this choice would show — a 0 says the tracker found none. */
  count: number;
  href: string;
}

/**
 * A dropdown for filtering by Interest Frame factor, wrapped around the
 * results it filters. Choosing an option navigates to its href, so the
 * filtered view is shareable, survives a reload, and the back button steps
 * through filters.
 *
 * The results are its children because this component starts the navigation:
 * while the server fetches the new rows, the old ones are wrong, so it swaps
 * them for the same loading screen the route shows on a cold visit.
 */
export function FactorFilter({
  options,
  active,
  label,
  children,
}: {
  options: FactorFilterOption[];
  /** The `value` of the selected option. */
  active: string;
  /** Visible label for the dropdown, e.g. "Filter by factor". */
  label: string;
  /** The filtered results, shown once the navigation settles. */
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <>
      <label className="mb-5 flex max-w-xs flex-col gap-1 text-xs text-ink-faint">
        {label}
        <Select
          // Remounting on `active` keeps the field in step with the URL when
          // the page changes underneath it — a back button press, say.
          key={active}
          defaultValue={active}
          disabled={pending}
          onChange={(event) => {
            const next = options.find((o) => o.value === event.target.value);
            if (next) startTransition(() => router.push(next.href));
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </Select>
      </label>

      {pending ? (
        <div aria-busy>
          <LoadingAnnouncement label="Loading extracts" />
          <SkeletonExtractList />
        </div>
      ) : (
        children
      )}
    </>
  );
}
