import { describe, expect, it } from "vitest";
import {
  countWebSearchCalls,
  describeWebSearch,
  webSearchSources,
} from "../src/lib/agents/usage-adapter";

const searchItem = (action: unknown) => ({
  type: "hosted_tool_call",
  name: "web_search_call",
  providerData: { action } as Record<string, unknown>,
});

describe("describeWebSearch", () => {
  it("reports the query for a search action", () => {
    expect(describeWebSearch(searchItem({ type: "search", query: "UMNO" }))).toBe(
      'Searched: "UMNO"',
    );
  });

  it("reports the url for an opened page", () => {
    expect(
      describeWebSearch(searchItem({ type: "open_page", url: "https://a.com/x" })),
    ).toBe("Opened: https://a.com/x");
  });

  it("degrades when no action details are reported", () => {
    expect(describeWebSearch({ type: "hosted_tool_call", name: "web_search" })).toBe(
      "Web search (no action details reported)",
    );
  });
});

describe("webSearchSources", () => {
  it("reads objects carrying url and title", () => {
    const results = webSearchSources(
      searchItem({
        type: "search",
        query: "q",
        sources: [
          { url: "https://a.com/1", title: "First" },
          { url: "https://b.com/2", title: "Second" },
        ],
      }),
    );
    expect(results).toEqual([
      { url: "https://a.com/1", title: "First" },
      { url: "https://b.com/2", title: "Second" },
    ]);
  });

  it("accepts bare url strings", () => {
    expect(
      webSearchSources(searchItem({ sources: ["https://a.com/1"] })),
    ).toEqual([{ url: "https://a.com/1" }]);
  });

  it("omits an empty or non-string title rather than storing a blank one", () => {
    expect(
      webSearchSources(
        searchItem({ sources: [{ url: "https://a.com", title: "" }] }),
      ),
    ).toEqual([{ url: "https://a.com" }]);
  });

  it("deduplicates repeated urls", () => {
    expect(
      webSearchSources(
        searchItem({
          sources: [{ url: "https://a.com" }, { url: "https://a.com" }],
        }),
      ),
    ).toEqual([{ url: "https://a.com" }]);
  });

  it("skips entries with no usable url", () => {
    expect(
      webSearchSources(
        searchItem({
          sources: [null, 42, {}, { title: "no url" }, { url: "https://ok.com" }],
        }),
      ),
    ).toEqual([{ url: "https://ok.com" }]);
  });

  it("returns nothing when sources are absent or malformed", () => {
    expect(webSearchSources(searchItem({ type: "search", query: "q" }))).toEqual([]);
    expect(webSearchSources(searchItem({ sources: "not-an-array" }))).toEqual([]);
    expect(webSearchSources({ type: "hosted_tool_call", name: "web_search" })).toEqual(
      [],
    );
  });
});

describe("countWebSearchCalls", () => {
  it("counts only hosted web-search items", () => {
    expect(
      countWebSearchCalls([
        searchItem({ query: "a" }),
        { type: "message" },
        { type: "hosted_tool_call", name: "file_search_call" },
        searchItem({ query: "b" }),
      ]),
    ).toBe(2);
  });
});
