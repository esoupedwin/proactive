import type { Extract, HeroImage, ReportSections } from "../types";

/**
 * Cover-image selection. Images are only ever taken from the report's own
 * sources (og:image / twitter:image meta tags fetched from the article
 * pages) — never invented. "Most suiting" = the image belonging to the
 * source the report leans on most, with Latest Developments weighted
 * highest.
 */

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 300_000;
const MAX_ATTEMPTS = 5;

/** Pulls an og:image / twitter:image URL out of raw HTML. Pure + testable. */
export function extractImageFromHtml(html: string): string | null {
  const names = "og:image(?::url)?|twitter:image(?::src)?";
  // <meta property="og:image" content="..."> (either attribute order)
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["'](?:${names})["'][^>]*content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:${names})["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

/** Fetches a page and returns its social-preview image URL, or null. */
export async function fetchOgImage(pageUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; ProactiveBot/1.0; +https://proactive.app)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;

    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const raw = extractImageFromHtml(html);
    if (!raw) return null;

    const resolved = new URL(raw, pageUrl);
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

/**
 * Orders source indexes by how much the report relies on them:
 * citations in Latest Developments count triple; uncited sources come last
 * in index order (still worth trying if cited ones have no image).
 */
export function rankSourcesByCitation(
  sections: Pick<
    ReportSections,
    "latest_developments" | "community_reaction" | "practitioner_view" | "what_changed"
  >,
  sourceCount: number,
): number[] {
  const scores = new Map<number, number>();
  const tally = (refs: number[], weight: number) => {
    for (const ref of refs) {
      if (ref >= 0 && ref < sourceCount) {
        scores.set(ref, (scores.get(ref) ?? 0) + weight);
      }
    }
  };
  for (const b of sections.latest_developments) tally(b.source_refs, 3);
  for (const b of sections.community_reaction) tally(b.source_refs, 1);
  for (const b of sections.practitioner_view) tally(b.source_refs, 1);
  for (const b of sections.what_changed) tally(b.source_refs, 1);

  const cited = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([index]) => index);
  const uncited = Array.from({ length: sourceCount }, (_, i) => i).filter(
    (i) => !scores.has(i),
  );
  return [...cited, ...uncited];
}

export type ImageFetcher = (pageUrl: string) => Promise<string | null>;

/** Finds the best available cover image for the report, or null. */
export async function findHeroImage(
  extracts: Extract[],
  sections: ReportSections,
  fetcher: ImageFetcher = fetchOgImage,
): Promise<HeroImage | null> {
  const order = rankSourcesByCitation(sections, extracts.length);
  for (const index of order.slice(0, MAX_ATTEMPTS)) {
    const extract = extracts[index];
    if (!extract) continue;
    const imageUrl = await fetcher(extract.url);
    if (imageUrl) {
      return { url: imageUrl, source_ref: index, alt: extract.title };
    }
  }
  return null;
}
