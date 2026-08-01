import { describe, expect, it } from "vitest";
import { generateNewsQuery } from "@/lib/ai/news-query";
import type { Llm, StructuredCallOptions } from "@/lib/ai/llm";
import {
  braveFreshness,
  filterNewsByAge,
  markNewResults,
  parseBraveNews,
  parseSerpApiNews,
  publishedAgeMs,
  type NewsResult,
} from "@/lib/news-search";

describe("parseBraveNews", () => {
  it("normalizes results and strips embedded HTML", () => {
    expect(
      parseBraveNews({
        results: [
          {
            title: "GLM-5 <strong>released</strong>",
            url: "https://news.example.com/glm5",
            description: "Zhipu ships <em>GLM-5</em> weights.",
            age: "2 days ago",
            meta_url: { netloc: "news.example.com" },
          },
          { description: "no title or url — skipped" },
        ],
      }),
    ).toEqual([
      {
        title: "GLM-5 released",
        url: "https://news.example.com/glm5",
        source: "news.example.com",
        published: "2 days ago",
        description: "Zhipu ships GLM-5 weights.",
      },
    ]);
  });

  it("handles empty and malformed payloads", () => {
    expect(parseBraveNews({})).toEqual([]);
    expect(parseBraveNews(null)).toEqual([]);
  });
});

describe("parseSerpApiNews", () => {
  it("normalizes results with object or string sources", () => {
    expect(
      parseSerpApiNews({
        news_results: [
          {
            title: "Kimi K3 tops benchmark",
            link: "https://example.com/kimi",
            source: { name: "Example Wire" },
            date: "07/30/2026",
            snippet: "Moonshot's model leads.",
          },
          {
            title: "String source",
            link: "https://example.com/2",
            source: "Sina Tech",
          },
          { snippet: "missing link — skipped" },
        ],
      }),
    ).toEqual([
      {
        title: "Kimi K3 tops benchmark",
        url: "https://example.com/kimi",
        source: "Example Wire",
        published: "07/30/2026",
        description: "Moonshot's model leads.",
      },
      {
        title: "String source",
        url: "https://example.com/2",
        source: "Sina Tech",
        published: "",
        description: "",
      },
    ]);
  });
});

describe("markNewResults", () => {
  const results: NewsResult[] = [
    {
      title: "Already collected",
      url: "https://news.example.com/story?utm_source=serp",
      source: "",
      published: "",
      description: "",
    },
    {
      title: "Fresh find",
      url: "https://news.example.com/other",
      source: "",
      published: "",
      description: "",
    },
  ];

  it("flags results absent from known sources, ignoring tracking params", () => {
    const marked = markNewResults(results, [
      "https://www.news.example.com/story/",
    ]);
    expect(marked[0]!.is_new).toBe(false);
    expect(marked[1]!.is_new).toBe(true);
  });

  it("everything is new when nothing was collected", () => {
    expect(markNewResults(results, []).every((r) => r.is_new)).toBe(true);
  });
});

describe("freshness window", () => {
  const NOW = new Date("2026-08-01T10:00:00Z");

  const result = (published: string): NewsResult => ({
    title: "t",
    url: `https://example.com/${published || "x"}`,
    source: "",
    published,
    description: "",
  });

  it("braveFreshness: pd for one day, an explicit date range otherwise", () => {
    expect(braveFreshness(1, NOW)).toBe("pd");
    expect(braveFreshness(3, NOW)).toBe("2026-07-29to2026-08-01");
  });

  it("publishedAgeMs handles relative labels, absolute dates, and unknowns", () => {
    expect(publishedAgeMs("2 days ago", NOW)).toBe(2 * 86_400_000);
    expect(publishedAgeMs("5 hours ago", NOW)).toBe(5 * 3_600_000);
    expect(publishedAgeMs("2026-07-30T10:00:00Z", NOW)).toBe(2 * 86_400_000);
    expect(publishedAgeMs("", NOW)).toBeNull();
    expect(publishedAgeMs("recently", NOW)).toBeNull();
  });

  it("publishedAgeMs parses SerpApi's google_news timestamp format as UTC", () => {
    expect(publishedAgeMs("07/30/2026, 10:00 AM, +0000 UTC", NOW)).toBe(
      2 * 86_400_000,
    );
    expect(publishedAgeMs("07/31/2026, 10:00 PM, +0000 UTC", NOW)).toBe(
      12 * 3_600_000,
    );
    expect(publishedAgeMs("08/01/2026, 12:30 AM, +0000 UTC", NOW)).toBe(
      9.5 * 3_600_000,
    );
  });

  it("filterNewsByAge drops results verifiably outside the window, keeps unknowns", () => {
    const kept = filterNewsByAge(
      [
        result("1 day ago"), // in window
        result("5 days ago"), // out
        result("2026-07-25"), // out
        result("2026-07-31"), // in
        result(""), // unknown — kept
      ],
      3,
      NOW,
    );
    expect(kept.map((r) => r.published)).toEqual([
      "1 day ago",
      "2026-07-31",
      "",
    ]);
  });
});

describe("generateNewsQuery", () => {
  it("asks the search tier for one evergreen query and trims it", async () => {
    let captured: StructuredCallOptions<unknown> | null = null;
    const fakeLlm: Llm = {
      async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
        captured = options as StructuredCallOptions<unknown>;
        return options.schema.parse({ query: "  China AI model releases  " });
      },
    };

    const query = await generateNewsQuery(fakeLlm, {
      title: "China's AI Landscape",
      description: "How China's AI ecosystem is evolving",
      interest_areas: ["New LLM releases"],
    });

    expect(query).toBe("China AI model releases");
    expect(captured!.tier).toBe("search");
    expect(captured!.useWebSearch).toBeUndefined();
  });
});
