import { describe, expect, it } from "vitest";
import { filterExtractsByAge, freshnessCutoff } from "@/lib/ai/freshness";
import { freshnessDays } from "@/lib/reports";
import type { Extract } from "@/lib/types";

const NOW = new Date("2026-07-30T10:00:00Z");

function makeExtract(published_at: string): Extract {
  return {
    source_type: "news",
    title: "T",
    publisher: "P",
    url: "https://example.com",
    published_at,
    gist: "g",
    relevance: "r",
    novelty: "new",
    contradiction: "",
  };
}

describe("freshnessDays", () => {
  it("derives the window from update frequency", () => {
    expect(freshnessDays("daily")).toBe(1);
    expect(freshnessDays("every_3_days")).toBe(3);
    expect(freshnessDays("weekly")).toBe(7);
    expect(freshnessDays("manual")).toBe(7);
  });
});

describe("freshnessCutoff", () => {
  it("is the start of the UTC day N days ago", () => {
    expect(freshnessCutoff("every_3_days", NOW).toISOString()).toBe(
      "2026-07-27T00:00:00.000Z",
    );
    expect(freshnessCutoff("daily", NOW).toISOString()).toBe(
      "2026-07-29T00:00:00.000Z",
    );
  });
});

describe("filterExtractsByAge", () => {
  const cutoff = freshnessCutoff("every_3_days", NOW); // 27 Jul 00:00 UTC

  it("drops extracts verifiably older than the cutoff", () => {
    const kept = filterExtractsByAge(
      [makeExtract("2026-07-24"), makeExtract("2026-07-26T23:59:00Z")],
      cutoff,
    );
    expect(kept).toHaveLength(0);
  });

  it("keeps extracts on or after the cutoff day", () => {
    const kept = filterExtractsByAge(
      [makeExtract("2026-07-27"), makeExtract("2026-07-30T09:00:00Z")],
      cutoff,
    );
    expect(kept).toHaveLength(2);
  });

  it("keeps extracts with unknown or unparseable dates", () => {
    const kept = filterExtractsByAge(
      [makeExtract(""), makeExtract("a few days ago"), makeExtract("unknown")],
      cutoff,
    );
    expect(kept).toHaveLength(3);
  });

  it("drops fuzzy-but-parseable old dates (lenient Date.parse counts as verifiable)", () => {
    // V8 parses "mid-July 2026" as 1 Jul 2026 — before the cutoff.
    expect(filterExtractsByAge([makeExtract("mid-July 2026")], cutoff)).toHaveLength(0);
  });
});
