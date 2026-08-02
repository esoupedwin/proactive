import { describe, expect, it } from "vitest";
import { sanitizeDraft } from "@/lib/agents/reporter/compose";
import type { ReportDraft } from "@/lib/agents/schemas";

const draft: ReportDraft = {
  latest_developments: [
    { text: "valid citation", source_refs: [0, 1] },
    { text: "hallucinated citation", source_refs: [7] },
  ],
  community_reaction: [{ text: "mixed refs", source_refs: [1, 9] }],
  practitioner_view: [],
  cross_source_takeaway: ["takeaway"],
  what_changed: [{ text: "narrative shift, no citation", source_refs: [12] }],
  no_meaningful_change: false,
  summary: "sum",
  cover_source_ref: 0,
};

describe("sanitizeDraft", () => {
  it("drops factual bullets whose only citations are out of range", () => {
    const clean = sanitizeDraft(draft, 2);
    expect(clean.latest_developments).toHaveLength(1);
    expect(clean.latest_developments[0]!.source_refs).toEqual([0, 1]);
    expect(clean.community_reaction).toHaveLength(1);
    expect(clean.community_reaction[0]!.source_refs).toEqual([1]);
  });

  it("keeps what_changed bullets but strips invalid refs", () => {
    const clean = sanitizeDraft(draft, 2);
    expect(clean.what_changed).toHaveLength(1);
    expect(clean.what_changed[0]!.source_refs).toEqual([]);
  });

  it("caps inline entity markers per bullet and per takeaway point", () => {
    const clean = sanitizeDraft(
      {
        ...draft,
        latest_developments: [
          { text: "**A** vs **B** vs **C** vs **D**", source_refs: [0] },
        ],
        cross_source_takeaway: ["**A** **B** **C**", "**D** only"],
      },
      2,
    );
    expect(clean.latest_developments[0]!.text).toBe("**A** vs **B** vs C vs D");
    expect(clean.cross_source_takeaway).toEqual(["**A** **B** C", "**D** only"]);
  });

  it("keeps a valid cover nomination and nulls an out-of-range one", () => {
    expect(sanitizeDraft(draft, 2).cover_source_ref).toBe(0);
    expect(
      sanitizeDraft({ ...draft, cover_source_ref: 9 }, 2).cover_source_ref,
    ).toBeNull();
    expect(
      sanitizeDraft({ ...draft, cover_source_ref: null }, 2).cover_source_ref,
    ).toBeNull();
  });

  it("keeps uncited bullets when there are no sources at all", () => {
    const clean = sanitizeDraft(
      {
        ...draft,
        latest_developments: [{ text: "no sources run", source_refs: [] }],
      },
      0,
    );
    expect(clean.latest_developments).toHaveLength(1);
  });
});
