import Exa from "exa-js";

/**
 * Exa semantic web search — the Info Tracker's discovery tool for angles
 * keyword news search misses (discussions, blogs, analysis).
 */

export interface ExaResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
}

export interface ExaSearchOptions {
  numResults?: number;
  /** Only results published within the last N days. */
  daysBack?: number;
  category?: "news" | "company" | "personal site" | "publication";
}

export interface ExaSearcher {
  search(query: string, opts?: ExaSearchOptions): Promise<ExaResult[]>;
}

let exaClient: Exa | null = null;

function getExa(): Exa {
  if (!exaClient) {
    if (!process.env.EXA_API_KEY) {
      throw new Error("EXA_API_KEY is not set");
    }
    exaClient = new Exa(process.env.EXA_API_KEY);
  }
  return exaClient;
}

export function createExaSearcher(): ExaSearcher {
  return {
    async search(query, opts = {}) {
      const startPublishedDate = opts.daysBack
        ? new Date(Date.now() - opts.daysBack * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10)
        : undefined;
      const response = await getExa().searchAndContents(query, {
        numResults: opts.numResults ?? 8,
        startPublishedDate,
        category: opts.category,
        text: { maxCharacters: 1500 },
        highlights: true,
      });
      return response.results.map((r) => ({
        title: r.title ?? r.url,
        url: r.url,
        publishedDate: r.publishedDate ?? undefined,
        author: r.author ?? undefined,
        text: r.text ?? undefined,
        highlights: r.highlights ?? undefined,
      }));
    },
  };
}
