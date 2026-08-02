import { normalizeUrl } from "./ai/dedupe";
import { cutoffForDays } from "./ai/freshness";
import type { ExaResult } from "./agents/exa";

/**
 * Direct news search for the "Related news" popup — Exa (semantic) when
 * EXA_API_KEY is set, falling back to Brave Search or SerpApi. Separate from
 * the agents' own search tools.
 */

// SerpApi runs live scrapes — first uncached query can take 10-20s.
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RESULTS = 10;
/** Fetched before window filtering, then trimmed to MAX_RESULTS. */
const MAX_RAW_RESULTS = 30;

export interface NewsResult {
  title: string;
  url: string;
  source: string;
  published: string;
  description: string;
}

export interface MarkedNewsResult extends NewsResult {
  /** True when this article is not yet in the topic's collected sources. */
  is_new: boolean;
}

export type NewsProvider = "brave" | "serpapi";

export function configuredNewsProvider(): NewsProvider | null {
  if (process.env.BRAVE_SEARCH_API_KEY) return "brave";
  if (process.env.SERPAPI_API_KEY) return "serpapi";
  return null;
}

const stripHtml = (text: string) => text.replace(/<[^>]+>/g, "");

/** Exa results → normalized news results. Pure + testable. */
export function exaToNewsResults(results: ExaResult[]): NewsResult[] {
  return results.flatMap((result) => {
    if (!result.url) return [];
    let source = "";
    try {
      source = new URL(result.url).hostname.replace(/^www\./i, "");
    } catch {
      // keep empty source for unparseable urls
    }
    return [
      {
        title: result.title || result.url,
        url: result.url,
        source,
        published: result.publishedDate ?? "",
        description:
          result.highlights?.join(" … ") ?? result.text?.slice(0, 240) ?? "",
      },
    ];
  });
}

/** Brave news response → normalized results. Pure + testable. */
export function parseBraveNews(json: unknown): NewsResult[] {
  const results = (json as { results?: unknown[] } | null)?.results ?? [];
  return results.flatMap((raw) => {
    const item = raw as {
      title?: string;
      url?: string;
      description?: string;
      age?: string;
      page_age?: string;
      meta_url?: { netloc?: string };
    };
    if (!item?.title || !item?.url) return [];
    return [
      {
        title: stripHtml(item.title),
        url: item.url,
        source: item.meta_url?.netloc ?? "",
        published: item.age ?? item.page_age ?? "",
        description: stripHtml(item.description ?? ""),
      },
    ];
  });
}

/** SerpApi google_news response → normalized results. Pure + testable. */
export function parseSerpApiNews(json: unknown): NewsResult[] {
  const results =
    (json as { news_results?: unknown[] } | null)?.news_results ?? [];
  return results.flatMap((raw) => {
    const item = raw as {
      title?: string;
      link?: string;
      snippet?: string;
      date?: string;
      source?: string | { name?: string };
    };
    if (!item?.title || !item?.link) return [];
    const source =
      typeof item.source === "string" ? item.source : (item.source?.name ?? "");
    return [
      {
        title: item.title,
        url: item.link,
        source,
        published: item.date ?? "",
        description: item.snippet ?? "",
      },
    ];
  });
}

/** Brave freshness parameter for an N-day window: pd for 1, a date range otherwise. */
export function braveFreshness(days: number, now: Date = new Date()): string {
  if (days <= 1) return "pd";
  const to = now.toISOString().slice(0, 10);
  const from = cutoffForDays(days, now).toISOString().slice(0, 10);
  return `${from}to${to}`;
}

/**
 * Age of a result in milliseconds, from either a relative label
 * ("2 days ago") or an absolute date string. Null when unknown.
 */
export function publishedAgeMs(
  published: string,
  now: Date = new Date(),
): number | null {
  if (!published) return null;
  const relative = published.match(
    /(\d+)\s*(minute|hour|day|week|month)s?\s+ago/i,
  );
  if (relative) {
    const unitMs: Record<string, number> = {
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 7 * 86_400_000,
      month: 30 * 86_400_000,
    };
    return Number(relative[1]) * unitMs[relative[2]!.toLowerCase()]!;
  }

  // SerpApi google_news format: "07/27/2026, 08:59 PM, +0000 UTC"
  const serp = published.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM),?\s*\+0000\s*UTC$/i,
  );
  if (serp) {
    const [, month, day, year, hourRaw, minute, meridiem] = serp;
    let hour = Number(hourRaw) % 12;
    if (meridiem!.toUpperCase() === "PM") hour += 12;
    const timestamp = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      hour,
      Number(minute),
    );
    return now.getTime() - timestamp;
  }

  const parsed = Date.parse(published);
  if (Number.isNaN(parsed)) return null;
  return now.getTime() - parsed;
}

/**
 * Hard window enforcement on top of the provider filter: drops results
 * verifiably older than the window; unknown dates are kept.
 */
export function filterNewsByAge(
  results: NewsResult[],
  days: number,
  now: Date = new Date(),
): NewsResult[] {
  const cutoffMs = cutoffForDays(days, now).getTime();
  return results.filter((result) => {
    const age = publishedAgeMs(result.published, now);
    if (age === null) return true;
    return now.getTime() - age >= cutoffMs;
  });
}

/** Runs the news search, scoped to the last `days` days. */
export async function searchNews(
  query: string,
  days: number,
): Promise<{ provider: NewsProvider; results: NewsResult[] }> {
  const provider = configuredNewsProvider();
  if (!provider) {
    throw new Error("No news search provider configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    if (provider === "brave") {
      const url =
        "https://api.search.brave.com/res/v1/news/search" +
        `?q=${encodeURIComponent(query)}&count=${MAX_RESULTS}` +
        `&freshness=${braveFreshness(days)}`;
      const res = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!,
          accept: "application/json",
        },
      });
      if (!res.ok) throw new Error(`Brave search failed: HTTP ${res.status}`);
      return { provider, results: parseBraveNews(await res.json()) };
    }

    // google_news has no date filter, but returns precise absolute dates —
    // the window is enforced by filterNewsByAge downstream. (Do NOT switch
    // to engine=google&tbm=nws for its qdr filter: Google retired tbm=nws
    // and that engine hangs indefinitely.)
    const url =
      "https://serpapi.com/search.json?engine=google_news" +
      `&q=${encodeURIComponent(query)}&api_key=${process.env.SERPAPI_API_KEY}`;
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`SerpApi search failed: HTTP ${res.status}`);
    return {
      provider,
      results: parseSerpApiNews(await res.json()).slice(0, MAX_RAW_RESULTS),
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        `The ${provider} search timed out after ${FETCH_TIMEOUT_MS / 1000}s — try again.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Flags which results the topic has not collected before, comparing
 * tracking-parameter-insensitive normalized URLs against stored sources.
 */
export function markNewResults(
  results: NewsResult[],
  knownUrls: Iterable<string>,
): MarkedNewsResult[] {
  const known = new Set([...knownUrls].map(normalizeUrl));
  return results.map((result) => ({
    ...result,
    is_new: !known.has(normalizeUrl(result.url)),
  }));
}
