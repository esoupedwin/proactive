import { describe, expect, it } from "vitest";
import {
  extractImageFromHtml,
  findHeroImage,
  rankSourcesByCitation,
} from "@/lib/ai/images";
import type { Extract, ReportSections } from "@/lib/types";

function makeExtract(url: string, title = "Title"): Extract {
  return {
    source_type: "news",
    title,
    publisher: "Pub",
    url,
    published_at: "2026-07-24",
    gist: "gist",
    relevance: "relevant",
    novelty: "new",
    contradiction: "",
  };
}

function makeSections(overrides: Partial<ReportSections> = {}): ReportSections {
  return {
    latest_developments: [],
    community_reaction: [],
    practitioner_view: [],
    cross_source_takeaway: "",
    what_changed: [],
    no_meaningful_change: false,
    ...overrides,
  };
}

describe("extractImageFromHtml", () => {
  it("finds og:image with property-first attribute order", () => {
    expect(
      extractImageFromHtml(
        `<meta property="og:image" content="https://cdn.example.com/a.jpg">`,
      ),
    ).toBe("https://cdn.example.com/a.jpg");
  });

  it("finds og:image with content-first attribute order", () => {
    expect(
      extractImageFromHtml(
        `<meta content="https://cdn.example.com/b.jpg" property="og:image">`,
      ),
    ).toBe("https://cdn.example.com/b.jpg");
  });

  it("falls back to twitter:image", () => {
    expect(
      extractImageFromHtml(
        `<meta name="twitter:image" content="https://cdn.example.com/c.jpg">`,
      ),
    ).toBe("https://cdn.example.com/c.jpg");
  });

  it("returns null when no image meta exists", () => {
    expect(extractImageFromHtml("<html><body>no images</body></html>")).toBeNull();
  });
});

describe("rankSourcesByCitation", () => {
  it("weights Latest Developments citations highest, appends uncited last", () => {
    const sections = makeSections({
      // source 2 cited once in latest (weight 3); source 0 cited twice in
      // other sections (weight 2). Source 1 uncited.
      latest_developments: [{ text: "a", source_refs: [2] }],
      community_reaction: [{ text: "b", source_refs: [0] }],
      practitioner_view: [{ text: "c", source_refs: [0] }],
    });
    expect(rankSourcesByCitation(sections, 3)).toEqual([2, 0, 1]);
  });

  it("ignores out-of-range refs", () => {
    const sections = makeSections({
      latest_developments: [{ text: "a", source_refs: [99, -1] }],
    });
    expect(rankSourcesByCitation(sections, 2)).toEqual([0, 1]);
  });
});

describe("findHeroImage", () => {
  const extracts = [
    makeExtract("https://a.com/1", "First"),
    makeExtract("https://b.com/2", "Second"),
  ];
  const sections = makeSections({
    latest_developments: [{ text: "x", source_refs: [1] }],
  });

  it("returns the image of the highest-ranked source that has one", async () => {
    const hero = await findHeroImage(extracts, sections, async (url) =>
      url.includes("b.com") ? "https://b.com/img.jpg" : null,
    );
    expect(hero).toEqual({
      url: "https://b.com/img.jpg",
      source_ref: 1,
      alt: "Second",
    });
  });

  it("falls through to lower-ranked sources when the top one has no image", async () => {
    const hero = await findHeroImage(extracts, sections, async (url) =>
      url.includes("a.com") ? "https://a.com/img.jpg" : null,
    );
    expect(hero?.source_ref).toBe(0);
  });

  it("returns null when no source yields an image", async () => {
    expect(await findHeroImage(extracts, sections, async () => null)).toBeNull();
  });

  it("returns null for empty extracts", async () => {
    expect(await findHeroImage([], sections, async () => "x")).toBeNull();
  });
});
