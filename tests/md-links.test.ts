import { describe, expect, it } from "vitest";
import {
  cleanLinkUrl,
  linkBadgeLabel,
  splitMarkdownLinks,
  stripMarkdownLinks,
} from "@/lib/md-links";

const THREAD =
  "https://www.reddit.com/r/indonesia/comments/1v9obf3/survei/?utm_source=openai";

describe("splitMarkdownLinks", () => {
  it("splits prose around a paren-wrapped citation, consuming the parens", () => {
    const segments = splitMarkdownLinks(
      `Polls dropped. ([reddit.com](${THREAD})) A recurring theme is skepticism.`,
    );
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ type: "text", text: "Polls dropped. " });
    expect(segments[1]).toMatchObject({ type: "link", label: "reddit.com" });
    expect(segments[2]).toEqual({
      type: "text",
      text: " A recurring theme is skepticism.",
    });
  });

  it("handles bare links and keeps surrounding prose parentheses", () => {
    const segments = splitMarkdownLinks(
      "See [the thread](https://reddit.com/r/a/1) (which is heated).",
    );
    expect(segments[1]).toMatchObject({
      type: "link",
      label: "the thread",
      url: "https://reddit.com/r/a/1",
    });
    expect(segments[2]).toEqual({
      type: "text",
      text: " (which is heated).",
    });
  });

  it("returns plain text untouched", () => {
    expect(splitMarkdownLinks("No links here.")).toEqual([
      { type: "text", text: "No links here." },
    ]);
  });

  it("strips utm_* tracking params from link urls", () => {
    const [, link] = splitMarkdownLinks(`x ([reddit.com](${THREAD}))`);
    expect(link).toMatchObject({
      url: "https://www.reddit.com/r/indonesia/comments/1v9obf3/survei/",
    });
  });
});

describe("linkBadgeLabel", () => {
  it("labels reddit links by subreddit", () => {
    expect(linkBadgeLabel(THREAD, "reddit.com")).toBe("r/indonesia");
  });

  it("falls back to the hostname for non-reddit links", () => {
    expect(linkBadgeLabel("https://www.example.com/story", "x")).toBe(
      "example.com",
    );
  });

  it("falls back to the given label for unparseable urls", () => {
    expect(linkBadgeLabel("not a url", "source")).toBe("source");
  });
});

describe("cleanLinkUrl", () => {
  it("keeps non-utm query params", () => {
    expect(cleanLinkUrl("https://a.com/?page=2&utm_source=x")).toBe(
      "https://a.com/?page=2",
    );
  });
});

describe("stripMarkdownLinks", () => {
  it("removes citations and normalizes the leftover whitespace", () => {
    expect(
      stripMarkdownLinks(`Polls dropped. ([reddit.com](${THREAD})) Mood is split.`),
    ).toBe("Polls dropped. Mood is split.");
  });
});
