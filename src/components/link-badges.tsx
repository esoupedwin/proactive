import { ExternalLink } from "lucide-react";
import { linkBadgeLabel, splitMarkdownLinks } from "@/lib/md-links";

/**
 * Prose with inline markdown citations rendered as compact clickable badges
 * (e.g. "reuters.com ↗") instead of raw [label](url) text. Hook-free, so it
 * renders in server and client components alike.
 */
export function ParagraphWithLinkBadges({ text }: { text: string }) {
  return (
    <p className="mb-2 whitespace-pre-wrap text-sm leading-relaxed last:mb-0">
      {splitMarkdownLinks(text).map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <a
            key={i}
            href={segment.url}
            target="_blank"
            rel="noopener noreferrer"
            title={segment.url}
            className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full border border-rule bg-neutral-50 px-2 py-0.5 align-middle text-[11px] font-medium text-ink-soft hover:bg-neutral-100 hover:text-ink"
          >
            {linkBadgeLabel(segment.url, segment.label)}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ),
      )}
    </p>
  );
}
