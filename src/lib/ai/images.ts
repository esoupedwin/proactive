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

/**
 * SSRF guard for server-side page fetches. Page URLs come from extracts —
 * i.e. from model output over third-party web content — so only public
 * http(s) hosts may be fetched: no localhost, IP-literal private ranges, or
 * non-web schemes. Hostname-based (does not resolve DNS), which blocks the
 * plain attacks; defense in depth, not a perimeter.
 */
export function isFetchablePageUrl(pageUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;
  // IPv6 literals ([::1], [fc00::...], [fe80::...]) — block them wholesale;
  // real articles live on hostnames.
  if (host.startsWith("[") || host.includes(":")) return false;
  // IPv4 literals: loopback, private, link-local, unspecified.
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 127 ||
      a === 10 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    ) {
      return false;
    }
  }
  return true;
}

/** Fetches a page and returns its social-preview image URL + description, or null. */
export async function fetchOgImage(pageUrl: string): Promise<ImageMeta | null> {
  if (!isFetchablePageUrl(pageUrl)) return null;
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
 * Orders source indexes by how much the report relies on them: citations in
 * Latest Developments count triple. Uncited sources are excluded entirely —
 * a cover image from a source the report doesn't lean on reads as unrelated.
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

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([index]) => index);
}

export type ImageFetcher = (pageUrl: string) => Promise<ImageMeta | null>;

/**
 * Finds the best available cover image for the report, or null.
 * `preferredRef` is the reporter's own nomination — the source it judged
 * representative of the central development — and is always tried first.
 */
export async function findHeroImage(
  extracts: Extract[],
  sections: ReportSections,
  fetcher: ImageFetcher = fetchOgImage,
  preferredRef: number | null = null,
): Promise<HeroImage | null> {
  const ranked = rankSourcesByCitation(sections, extracts.length);
  const order =
    preferredRef !== null && preferredRef >= 0 && preferredRef < extracts.length
      ? [preferredRef, ...ranked.filter((i) => i !== preferredRef)]
      : ranked;
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
