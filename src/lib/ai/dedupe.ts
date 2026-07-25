import type { Extract } from "../types";

/**
 * Deduplicator — deterministic merging of repeated coverage.
 * Pure functions so they are cheap and unit-testable; the reporter handles
 * softer editorial merging on top of this.
 */

/** Normalizes a URL for identity comparison: strips protocol, www, tracking params, trailing slash. */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const params = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
      if (!/^(utm_|fbclid|gclid|ref$|ref_|source$)/i.test(key)) {
        params.set(key, value);
      }
    }
    const query = params.toString();
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}${query ? `?${query}` : ""}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** Tokenizes a title for similarity comparison. */
function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

/** Jaccard similarity of two titles, 0..1. */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  return intersection / (ta.size + tb.size - intersection);
}

const SIMILARITY_THRESHOLD = 0.6;

/**
 * Removes duplicate coverage:
 * 1. Exact same normalized URL → keep the first occurrence.
 * 2. Same channel + very similar titles → keep the extract with the richer gist.
 */
export function dedupeExtracts(extracts: Extract[]): Extract[] {
  // Pass 1: URL identity.
  const byUrl = new Map<string, Extract>();
  for (const extract of extracts) {
    const key = normalizeUrl(extract.url);
    if (!byUrl.has(key)) byUrl.set(key, extract);
  }

  // Pass 2: near-duplicate titles within the same channel.
  const kept: Extract[] = [];
  for (const candidate of byUrl.values()) {
    const duplicateIndex = kept.findIndex(
      (existing) =>
        existing.source_type === candidate.source_type &&
        titleSimilarity(existing.title, candidate.title) >= SIMILARITY_THRESHOLD,
    );
    if (duplicateIndex === -1) {
      kept.push(candidate);
    } else {
      const existing = kept[duplicateIndex]!;
      // Keep whichever has the richer gist.
      if (candidate.gist.length > existing.gist.length) {
        kept[duplicateIndex] = candidate;
      }
    }
  }
  return kept;
}
