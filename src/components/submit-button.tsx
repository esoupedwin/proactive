"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, Spinner } from "./ui";

/**
 * Submit button for server-action forms: shows a pending spinner while the
 * action runs and can guard destructive actions behind a confirm dialog.
 * Must be rendered INSIDE the <form> it submits (useFormStatus contract).
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  confirm,
}: {
  children: ReactNode;
  /** Label while the action runs; defaults to the normal label. */
  pendingLabel?: ReactNode;
  variant?: "primary" | "outline" | "ghost" | "danger";
  /** Ask before submitting — for destructive actions. */
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      onClick={
        confirm
          ? (e) => {
              if (!window.confirm(confirm)) e.preventDefault();
            }
          : undefined
      }
    >
      {pending && <Spinner />}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
