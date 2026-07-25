import { describe, expect, it } from "vitest";
import {
  dedupeExtracts,
  normalizeUrl,
  titleSimilarity,
} from "@/lib/ai/dedupe";
import type { Extract } from "@/lib/types";

function makeExtract(overrides: Partial<Extract>): Extract {
  return {
    source_type: "news",
    title: "A title",
    publisher: "Pub",
    url: "https://example.com/a",
    published_at: "2026-07-24",
    gist: "gist",
    relevance: "relevant",
    novelty: "new",
    contradiction: "",
    ...overrides,
  };
}

describe("normalizeUrl", () => {
  it("strips protocol, www, trailing slashes and tracking params", () => {
    expect(
      normalizeUrl("https://www.Example.com/story/?utm_source=x&utm_medium=y"),
    ).toBe("example.com/story");
    expect(normalizeUrl("http://example.com/story")).toBe("example.com/story");
  });

  it("keeps meaningful query params", () => {
    expect(normalizeUrl("https://example.com/watch?v=abc")).toBe(
      "example.com/watch?v=abc",
    );
  });

  it("falls back gracefully for invalid URLs", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});

describe("titleSimilarity", () => {
  it("is 1 for identical titles", () => {
    expect(titleSimilarity("OpenAI ships new model", "OpenAI ships new model")).toBe(1);
  });

  it("is high for near-duplicates and low for unrelated titles", () => {
    const near = titleSimilarity(
      "Anthropic releases Claude Opus 5 for enterprise coding",
      "Anthropic releases Claude Opus 5 targeting enterprise coding teams",
    );
    const far = titleSimilarity(
      "Anthropic releases Claude Opus 5",
      "Iran expands drone attacks in the Gulf",
    );
    expect(near).toBeGreaterThan(0.6);
    expect(far).toBeLessThan(0.2);
  });
});

describe("dedupeExtracts", () => {
  it("removes exact URL duplicates regardless of tracking params", () => {
    const extracts = [
      makeExtract({ url: "https://example.com/a?utm_source=reddit" }),
      makeExtract({ url: "https://www.example.com/a/" }),
      makeExtract({ url: "https://example.com/b", title: "Completely different other story" }),
    ];
    const result = dedupeExtracts(extracts);
    expect(result).toHaveLength(2);
  });

  it("merges near-duplicate titles within a channel, keeping the richer gist", () => {
    const extracts = [
      makeExtract({
        url: "https://a.com/1",
        title: "Claude Opus 5 released for enterprise coding",
        gist: "short",
      }),
      makeExtract({
        url: "https://b.com/2",
        title: "Claude Opus 5 released targeting enterprise coding",
        gist: "a much longer and richer gist with details",
      }),
    ];
    const result = dedupeExtracts(extracts);
    expect(result).toHaveLength(1);
    expect(result[0]!.gist).toContain("richer");
  });

  it("does not merge similar titles across different channels", () => {
    const extracts = [
      makeExtract({ url: "https://a.com/1", source_type: "news" }),
      makeExtract({ url: "https://b.com/2", source_type: "reddit" }),
    ];
    expect(dedupeExtracts(extracts)).toHaveLength(2);
  });
});
