import { describe, expect, it } from "vitest";
import { parseWikiResponse } from "@/lib/ai/experts/wiki-image";

describe("parseWikiResponse", () => {
  it("extracts the first page's thumbnail and canonical URL", () => {
    expect(
      parseWikiResponse({
        query: {
          pages: {
            "123": {
              pageid: 123,
              title: "Najib Razak",
              fullurl: "https://en.wikipedia.org/wiki/Najib_Razak",
              thumbnail: {
                source: "https://upload.wikimedia.org/najib.jpg",
                width: 240,
                height: 320,
              },
            },
          },
        },
      }),
    ).toEqual({
      image_url: "https://upload.wikimedia.org/najib.jpg",
      page_url: "https://en.wikipedia.org/wiki/Najib_Razak",
      page_title: "Najib Razak",
    });
  });

  it("falls back to a curid URL when fullurl is missing", () => {
    const result = parseWikiResponse({
      query: {
        pages: {
          "9": {
            pageid: 9,
            title: "Barisan Nasional",
            thumbnail: { source: "https://upload.wikimedia.org/bn-logo.png" },
          },
        },
      },
    });
    expect(result?.page_url).toBe("https://en.wikipedia.org/?curid=9");
  });

  it("returns null when the page has no lead image", () => {
    expect(
      parseWikiResponse({
        query: { pages: { "5": { pageid: 5, title: "Obscure Person" } } },
      }),
    ).toBeNull();
  });

  it("returns null for empty or malformed responses", () => {
    expect(parseWikiResponse({})).toBeNull();
    expect(parseWikiResponse(null)).toBeNull();
    expect(parseWikiResponse({ query: {} })).toBeNull();
  });
});
