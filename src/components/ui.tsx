import { clsx } from "clsx";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { FieldInfo } from "./field-info";

// Small hand-rolled UI kit in an editorial, shadcn-like style.

type ButtonVariant = "primary" | "outline" | "ghost" | "danger";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={clsx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary" && "bg-ink text-paper hover:bg-ink-soft",
        variant === "outline" &&
          "border border-rule bg-paper text-ink hover:bg-neutral-100",
        variant === "ghost" && "text-ink hover:bg-neutral-100",
        variant === "danger" &&
          "border border-red-200 bg-paper text-red-700 hover:bg-red-50",
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "min-h-11 w-full rounded-md border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full rounded-md border border-rule bg-paper px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "min-h-11 w-full rounded-md border border-rule bg-paper px-3 text-sm text-ink focus:border-ink focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  info,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  /** Purpose of the field, shown in a tap-toggled tooltip beside the label. */
  info?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center">
        <label htmlFor={htmlFor} className="text-sm font-semibold">
          {label}
        </label>
        {info && <FieldInfo label={label} text={info} />}
      </div>
      {children}
      {hint && !error && <p className="text-xs text-ink-faint">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "active" | "paused";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        tone === "neutral" && "border-rule text-ink-faint",
        tone === "active" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "paused" && "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-middle",
        className,
      )}
    />
  );
}
