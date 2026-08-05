import { describe, expect, it } from "vitest";
import {
  composeQuestionReport,
  composeReport,
  composeTrendingReport,
} from "@/lib/agents/reporter/compose";
import type {
  QuestionReporterFinal,
  ReporterFinal,
  TrendingReporterFinal,
} from "@/lib/agents/schemas";
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
    factor: null,
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

function questionFinal(
  overrides: Partial<QuestionReporterFinal> = {},
): QuestionReporterFinal {
  return {
    verdict: {
      answer: "Unlikely to happen this year.",
      likelihood: "unlikely",
      confidence: "medium",
      trend: "baseline",
      rationale: [{ text: "driver", extract_ids: ["a"] }],
    },
    factor_assessments: [
      { factor: "Political Incentives", bullets: [{ text: "f1", extract_ids: ["b"] }] },
    ],
    what_changed: [],
    no_meaningful_change: false,
    summary: "sum",
    cover_extract_id: null,
    key_subtopics: [],
    ...overrides,
  };
}

describe("composeQuestionReport", () => {
  it("builds verdict + factor sections with positional refs and empty briefing sections", () => {
    const result = composeQuestionReport(questionFinal(), byId(["a", "b"]));

    expect(result.snapshot.map((e) => e.id)).toEqual(["a", "b"]);
    expect(result.sections.verdict!.rationale[0]!.source_refs).toEqual([0]);
    expect(result.sections.factor_assessments![0]!.bullets[0]!.source_refs).toEqual([1]);
    expect(result.sections.verdict!.likelihood).toBe("unlikely");
    expect(result.sections.verdict!.trend).toBe("baseline");
    // Question reports carry no briefing sections.
    expect(result.sections.latest_developments).toHaveLength(0);
    expect(result.sections.cross_source_takeaway).toHaveLength(0);
  });

  it("drops hallucinated citations and factors left without evidence", () => {
    const result = composeQuestionReport(
      questionFinal({
        factor_assessments: [
          { factor: "Ghost Factor", bullets: [{ text: "x", extract_ids: ["ghost"] }] },
          { factor: "Real Factor", bullets: [{ text: "y", extract_ids: ["b"] }] },
        ],
      }),
      byId(["a", "b"]),
    );

    expect(result.sections.factor_assessments!.map((f) => f.factor)).toEqual([
      "Real Factor",
    ]);
  });

  it("keeps uncited bullets only when there are no sources at all (empty baseline)", () => {
    const result = composeQuestionReport(
      questionFinal({
        verdict: {
          answer: "Too early to say.",
          likelihood: "possible",
          confidence: "low",
          trend: "baseline",
          rationale: [{ text: "no evidence yet", extract_ids: [] }],
        },
        factor_assessments: [],
      }),
      byId([]),
    );
    expect(result.snapshot).toHaveLength(0);
    expect(result.sections.verdict!.rationale).toHaveLength(1);
  });

  it("maps the cover nominee and keeps what_changed narrative bullets", () => {
    const result = composeQuestionReport(
      questionFinal({
        cover_extract_id: "b",
        what_changed: [{ text: "narrative", extract_ids: [] }],
      }),
      byId(["a", "b"]),
    );
    expect(result.coverRef).toBe(1);
    expect(result.sections.what_changed).toHaveLength(1);
  });
});

function trendingFinal(
  overrides: Partial<TrendingReporterFinal> = {},
): TrendingReporterFinal {
  return {
    trending: [
      {
        subject: "Kimi K3",
        momentum: "rising",
        mood: "mixed — hype vs cost doubts",
        bullets: [{ text: "Benchmarks lead the charts", extract_ids: ["a"] }],
        talking_point: "Everyone's testing Kimi K3 this week.",
      },
    ],
    what_changed: [],
    no_meaningful_change: false,
    summary: "sum",
    cover_extract_id: null,
    key_subtopics: [],
    ...overrides,
  };
}

describe("composeTrendingReport", () => {
  it("builds trending items with positional refs and empty briefing sections", () => {
    const result = composeTrendingReport(trendingFinal(), byId(["a"]));

    expect(result.snapshot.map((e) => e.id)).toEqual(["a"]);
    const item = result.sections.trending![0]!;
    expect(item.subject).toBe("Kimi K3");
    expect(item.momentum).toBe("rising");
    expect(item.bullets[0]!.source_refs).toEqual([0]);
    expect(result.sections.latest_developments).toHaveLength(0);
  });

  it("drops items whose evidence was entirely hallucinated", () => {
    const result = composeTrendingReport(
      trendingFinal({
        trending: [
          {
            subject: "Ghost story",
            momentum: "new",
            mood: "n/a",
            bullets: [{ text: "x", extract_ids: ["ghost"] }],
            talking_point: "…",
          },
          {
            subject: "Real story",
            momentum: "new",
            mood: "positive",
            bullets: [{ text: "y", extract_ids: ["b"] }],
            talking_point: "…",
          },
        ],
      }),
      byId(["b"]),
    );
    expect(result.sections.trending!.map((i) => i.subject)).toEqual([
      "Real story",
    ]);
  });

  it("maps the cover nominee into the snapshot", () => {
    const result = composeTrendingReport(
      trendingFinal({ cover_extract_id: "b" }),
      byId(["a", "b"]),
    );
    expect(result.snapshot.map((e) => e.id)).toEqual(["a", "b"]);
    expect(result.coverRef).toBe(1);
  });

  it("caps entity markers in subjects and talking points", () => {
    const result = composeTrendingReport(
      trendingFinal({
        trending: [
          {
            subject: "**A** vs **B** vs **C**",
            momentum: "steady",
            mood: "calm",
            bullets: [{ text: "z", extract_ids: ["a"] }],
            talking_point: "**One** **Two** **Three** point.",
          },
        ],
      }),
      byId(["a"]),
    );
    const item = result.sections.trending![0]!;
    expect(item.subject.match(/\*\*[^*]+\*\*/g)).toHaveLength(2);
    expect(item.talking_point.match(/\*\*[^*]+\*\*/g)).toHaveLength(2);
  });
});
