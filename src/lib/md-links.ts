/**
 * Splits prose containing inline markdown links — the citation style
 * web-search models produce, e.g. "…polls dropped. ([reddit.com](https://…))"
 * — into text and link segments, so the UI can render links as badges and
 * the speech script can drop them entirely.
 */

export interface TextSegment {
  type: "text";
  text: string;
}

export interface LinkSegment {
  type: "link";
  /** Label as written in the markdown, e.g. "reddit.com". */
  label: string;
  url: string;
}

export type MarkdownSegment = TextSegment | LinkSegment;

// A markdown link, optionally wrapped in its own parentheses (the common
// "…claim. ([label](url))" citation shape) — the wrapping parens are consumed
// so no empty "()" is left behind in the prose.
const LINK_RE =
  /\(\s*\[([^\]]*)\]\(\s*([^()\s]+)\s*\)\s*\)|\[([^\]]*)\]\(\s*([^()\s]+)\s*\)/g;

/** Removes utm_* tracking params (e.g. utm_source=openai) from a link. */
export function cleanLinkUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith("utm_")) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/** A compact display label: "r/subreddit" for Reddit links, else the host. */
export function linkBadgeLabel(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const subreddit = /^\/r\/([^/]+)/.exec(parsed.pathname);
    if (subreddit) return `r/${subreddit[1]}`;
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return fallback;
  }
}

export function splitMarkdownLinks(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const [full, wrappedLabel, wrappedUrl, bareLabel, bareUrl] = match;
    const before = text.slice(last, match.index);
    if (before) segments.push({ type: "text", text: before });
    segments.push({
      type: "link",
      label: (wrappedLabel ?? bareLabel ?? "").trim(),
      url: cleanLinkUrl((wrappedUrl ?? bareUrl ?? "").trim()),
    });
    last = match.index + full.length;
  }
  const rest = text.slice(last);
  if (rest) segments.push({ type: "text", text: rest });
  return segments;
}

/** The prose with all markdown links removed — for text-to-speech. */
export function stripMarkdownLinks(text: string): string {
  return splitMarkdownLinks(text)
    .filter((s): s is TextSegment => s.type === "text")
    .map((s) => s.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
