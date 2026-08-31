import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { LinkPending } from "./link-pending";

/**
 * The header every settings sub-page shares: a back link to the settings hub
 * and the page's own title. Each function lives on its own page, so the back
 * link is the way out of all of them.
 */
export function SettingsHeader({
  title,
  description,
  backHref = "/settings",
  backLabel = "Settings",
}: {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="mb-6 border-b border-rule pb-4">
      <Link
        href={backHref}
        className="mb-2 inline-flex items-center gap-1 text-sm text-ink-faint hover:text-ink"
      >
        <LinkPending>
          <ChevronLeft className="size-4" aria-hidden />
        </LinkPending>{" "}
        {backLabel}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description && (
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          {description}
        </p>
      )}
    </header>
  );
}
