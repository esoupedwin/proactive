/**
 * Wikipedia image lookup for Mentor's entity profiles: a person's portrait
 * or an organisation's logo, from the entity's Wikipedia page lead image.
 * Grounded like the report cover images — we never let a model supply an
 * image URL.
 */

const FETCH_TIMEOUT_MS = 4000;
const THUMB_SIZE = 240;

export interface WikiImage {
  image_url: string;
  page_url: string;
  page_title: string;
}

export type WikiImageFetcher = (name: string) => Promise<WikiImage | null>;

interface WikiPage {
  pageid?: number;
  title?: string;
  fullurl?: string;
  thumbnail?: { source?: string };
}

/** Extracts the first page's thumbnail from a MediaWiki query response. Pure + testable. */
export function parseWikiResponse(json: unknown): WikiImage | null {
  const pages = (
    json as { query?: { pages?: Record<string, WikiPage> } } | null
  )?.query?.pages;
  if (!pages) return null;

  const page = Object.values(pages)[0];
  const imageUrl = page?.thumbnail?.source;
  if (!page || !imageUrl) return null;

  return {
    image_url: imageUrl,
    page_url:
      page.fullurl ??
      (page.pageid ? `https://en.wikipedia.org/?curid=${page.pageid}` : ""),
    page_title: page.title ?? "",
  };
}

/**
 * Searches Wikipedia for the entity and returns its page's lead image.
 * One request: search + thumbnail + canonical URL. Best-effort — any
 * failure (no page, no image, timeout) returns null.
 */
export const fetchWikiImage: WikiImageFetcher = async (name) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const url =
      "https://en.wikipedia.org/w/api.php" +
      `?action=query&generator=search&gsrsearch=${encodeURIComponent(name)}` +
      "&gsrnamespace=0&gsrlimit=1" +
      `&prop=pageimages%7Cinfo&inprop=url&piprop=thumbnail&pithumbsize=${THUMB_SIZE}` +
      "&format=json";

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Wikipedia asks API clients for a descriptive user agent.
        "user-agent": "ProactiveBot/1.0 (personal research briefing app)",
        accept: "application/json",
      },
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    return parseWikiResponse(await res.json());
  } catch {
    return null;
  }
};
