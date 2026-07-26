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

export interface ImageMeta {
  url: string;
  /** The page's own description of the image (og:image:alt), if any. */
  alt: string | null;
}

function matchMetaContent(html: string, names: string): string | null {
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

/** Pulls the og:image/twitter:image URL + alt text out of raw HTML. Pure + testable. */
export function extractImageMetaFromHtml(html: string): ImageMeta | null {
  const url = matchMetaContent(
    html,
    "og:image(?::url)?|twitter:image(?::src)?",
  );
  if (!url) return null;
  return {
    url,
    alt: matchMetaContent(html, "og:image:alt|twitter:image:alt"),
  };
}

/** Fetches a page and returns its social-preview image URL + description, or null. */
export async function fetchOgImage(pageUrl: string): Promise<ImageMeta | null> {
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
    const meta = extractImageMetaFromHtml(html);
    if (!meta) return null;

    const resolved = new URL(meta.url, pageUrl);
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
      return null;
    }
    return { url: resolved.toString(), alt: meta.alt };
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

export type ImageFetcher = (pageUrl: string) => Promise<ImageMeta | null>;

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
    const meta = await fetcher(extract.url);
    if (meta) {
      return {
        url: meta.url,
        source_ref: index,
        // The page's own image description doubles as alt text when present.
        alt: meta.alt ?? extract.title,
        description: meta.alt,
      };
    }
  }
  return null;
}
