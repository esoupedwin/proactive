import { describe, expect, it } from "vitest";
import {
  extractImageMetaFromHtml,
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

describe("extractImageMetaFromHtml", () => {
  it("finds og:image with property-first attribute order", () => {
    expect(
      extractImageMetaFromHtml(
        `<meta property="og:image" content="https://cdn.example.com/a.jpg">`,
      ),
    ).toEqual({ url: "https://cdn.example.com/a.jpg", alt: null });
  });

  it("finds og:image with content-first attribute order", () => {
    expect(
      extractImageMetaFromHtml(
        `<meta content="https://cdn.example.com/b.jpg" property="og:image">`,
      ),
    ).toEqual({ url: "https://cdn.example.com/b.jpg", alt: null });
  });

  it("falls back to twitter:image", () => {
    expect(
      extractImageMetaFromHtml(
        `<meta name="twitter:image" content="https://cdn.example.com/c.jpg">`,
      ),
    ).toEqual({ url: "https://cdn.example.com/c.jpg", alt: null });
  });

  it("captures the page's own image description (og:image:alt)", () => {
    expect(
      extractImageMetaFromHtml(
        `<meta property="og:image" content="https://cdn.example.com/d.jpg">
         <meta property="og:image:alt" content="Protesters gather at dusk">`,
      ),
    ).toEqual({
      url: "https://cdn.example.com/d.jpg",
      alt: "Protesters gather at dusk",
    });
  });

  it("returns null when no image meta exists", () => {
    expect(
      extractImageMetaFromHtml("<html><body>no images</body></html>"),
    ).toBeNull();
  });
});

describe("rankSourcesByCitation", () => {
  it("weights Latest Developments citations highest and excludes uncited sources", () => {
    const sections = makeSections({
      // source 2 cited once in latest (weight 3); source 0 cited twice in
      // other sections (weight 2). Source 1 uncited — never a cover candidate.
      latest_developments: [{ text: "a", source_refs: [2] }],
      community_reaction: [{ text: "b", source_refs: [0] }],
      practitioner_view: [{ text: "c", source_refs: [0] }],
    });
    expect(rankSourcesByCitation(sections, 3)).toEqual([2, 0]);
  });

  it("ignores out-of-range refs and yields nothing when nothing valid is cited", () => {
    const sections = makeSections({
      latest_developments: [{ text: "a", source_refs: [99, -1] }],
    });
    expect(rankSourcesByCitation(sections, 2)).toEqual([]);
  });
});

describe("findHeroImage", () => {
  const extracts = [
    makeExtract("https://a.com/1", "First"),
    makeExtract("https://b.com/2", "Second"),
  ];
  const sections = makeSections({
    latest_developments: [{ text: "x", source_refs: [1] }],
    community_reaction: [{ text: "y", source_refs: [0] }],
  });

  it("returns the image of the highest-ranked source, using the page's alt as description", async () => {
    const hero = await findHeroImage(extracts, sections, async (url) =>
      url.includes("b.com")
        ? { url: "https://b.com/img.jpg", alt: "Crowd at product launch" }
        : null,
    );
    expect(hero).toEqual({
      url: "https://b.com/img.jpg",
      source_ref: 1,
      alt: "Crowd at product launch",
      description: "Crowd at product launch",
    });
  });

  it("falls back to lower-ranked cited sources, using the title when the page has no alt", async () => {
    const hero = await findHeroImage(extracts, sections, async (url) =>
      url.includes("a.com") ? { url: "https://a.com/img.jpg", alt: null } : null,
    );
    expect(hero).toEqual({
      url: "https://a.com/img.jpg",
      source_ref: 0,
      alt: "First",
      description: null,
    });
  });

  it("tries the reporter's nominated source first, even when lower-ranked", async () => {
    const hero = await findHeroImage(
      extracts,
      sections,
      async (url) =>
        url.includes("a.com")
          ? { url: "https://a.com/img.jpg", alt: null }
          : { url: "https://b.com/img.jpg", alt: null },
      0, // nominated: source 0, despite source 1 being the citation leader
    );
    expect(hero?.source_ref).toBe(0);
  });

  it("ignores an out-of-range nomination", async () => {
    const hero = await findHeroImage(
      extracts,
      sections,
      async () => ({ url: "https://img.jpg", alt: null }),
      99,
    );
    expect(hero?.source_ref).toBe(1);
  });

  it("never uses an uncited source, even when it has an image", async () => {
    const uncitedOnly = makeSections({
      latest_developments: [{ text: "x", source_refs: [] }],
    });
    expect(
      await findHeroImage(extracts, uncitedOnly, async () => ({
        url: "https://img.jpg",
        alt: null,
      })),
    ).toBeNull();
  });

  it("returns null when no source yields an image", async () => {
    expect(await findHeroImage(extracts, sections, async () => null)).toBeNull();
  });

  it("returns null for empty extracts", async () => {
    expect(
      await findHeroImage([], sections, async () => ({ url: "x", alt: null })),
    ).toBeNull();
  });
});
