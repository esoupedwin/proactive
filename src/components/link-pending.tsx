"use client";

import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { clsx } from "clsx";

/**
 * Swaps its children for a spinner while the enclosing <Link>'s navigation is
 * in flight. Must be rendered as a descendant of a <Link> — `useLinkStatus`
 * reads the pending state from that link.
 *
 * Sizes its own spinner rather than reusing <Spinner>, whose size is fixed at
 * size-4 and would collide with the size-5 nav icons.
 */
export function LinkPending({
  children,
  className = "size-4",
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { pending } = useLinkStatus();

  if (!pending) return <>{children}</>;

  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx(
        "inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-middle",
        className,
      )}
    />
  );
}
