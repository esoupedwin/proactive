import { describe, expect, it } from "vitest";
import { composeReport } from "@/lib/agents/reporter/compose";
import type { ReporterFinal } from "@/lib/agents/schemas";
import type { ExtractRecord } from "@/lib/types";

function extract(id: string, title = `Title ${id}`): ExtractRecord {
  return {
    id,
    topic_id: "topic-1",
    user_id: "user-1",
    source_type: "news",
    title,
    publisher: "Pub",
    url: `https://example.com/${id}`,
    canonical_url: `example.com/${id}`,
    published_at: "2026-08-01",
    gist: `Gist ${id}`,
    relevance: null,
    novelty: "new",
    contradiction: null,
    corroborations: 0,
    corroborating_urls: [],
    duplicate_of: null,
    created_at: "2026-08-01T00:00:00Z",
    last_seen_at: "2026-08-01T00:00:00Z",
  };
}

function final(overrides: Partial<ReporterFinal> = {}): ReporterFinal {
  return {
    latest_developments: [],
    community_reaction: [],
    practitioner_view: [],
    cross_source_takeaway: ["takeaway"],
    what_changed: [],
    no_meaningful_change: false,
    summary: "sum",
    cover_extract_id: null,
    key_subtopics: [],
    ...overrides,
  };
}

const byId = (ids: string[]) => new Map(ids.map((id) => [id, extract(id)]));

describe("composeReport", () => {
  it("maps extract ids to positional refs in first-appearance order", () => {
    const result = composeReport(
      final({
        latest_developments: [
          { text: "b then a", extract_ids: ["b", "a"] },
          { text: "a again", extract_ids: ["a"] },
        ],
        community_reaction: [{ text: "c", extract_ids: ["c"] }],
      }),
      byId(["a", "b", "c"]),
    );

    expect(result.snapshot.map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(result.sections.latest_developments[0]!.source_refs).toEqual([0, 1]);
    expect(result.sections.latest_developments[1]!.source_refs).toEqual([1]);
    expect(result.sections.community_reaction[0]!.source_refs).toEqual([2]);
  });

  it("drops invented extract ids, and bullets left without citations", () => {
    const result = composeReport(
      final({
        latest_developments: [
          { text: "real", extract_ids: ["a"] },
          { text: "hallucinated", extract_ids: ["ghost"] },
        ],
      }),
      byId(["a"]),
    );

    expect(result.snapshot.map((e) => e.id)).toEqual(["a"]);
    expect(result.sections.latest_developments).toHaveLength(1);
    expect(result.sections.latest_developments[0]!.text).toBe("real");
  });

  it("adds an uncited cover nominee to the snapshot and maps coverRef", () => {
    const result = composeReport(
      final({
        latest_developments: [{ text: "lead", extract_ids: ["a"] }],
        cover_extract_id: "b",
      }),
      byId(["a", "b"]),
    );

    expect(result.snapshot.map((e) => e.id)).toEqual(["a", "b"]);
    expect(result.coverRef).toBe(1);
  });

  it("nulls the cover when the nominated id was never served", () => {
    const result = composeReport(
      final({
        latest_developments: [{ text: "lead", extract_ids: ["a"] }],
        cover_extract_id: "ghost",
      }),
      byId(["a"]),
    );
    expect(result.coverRef).toBeNull();
    expect(result.snapshot.map((e) => e.id)).toEqual(["a"]);
  });

  it("keeps what_changed narrative bullets even without citations", () => {
    const result = composeReport(
      final({
        what_changed: [{ text: "narrative shift", extract_ids: [] }],
        no_meaningful_change: true,
      }),
      byId([]),
    );
    expect(result.snapshot).toHaveLength(0);
    expect(result.sections.what_changed).toHaveLength(1);
    expect(result.sections.no_meaningful_change).toBe(true);
  });

  it("caps entity markers via sanitize", () => {
    const result = composeReport(
      final({
        latest_developments: [
          {
            text: "**One** and **Two** and **Three** moved",
            extract_ids: ["a"],
          },
        ],
      }),
      byId(["a"]),
    );
    const marks =
      result.sections.latest_developments[0]!.text.match(/\*\*[^*]+\*\*/g) ??
      [];
    expect(marks).toHaveLength(2);
  });
});
