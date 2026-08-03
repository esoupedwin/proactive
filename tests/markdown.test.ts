import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@/lib/markdown";

describe("parseMarkdown", () => {
  it("parses headings, clamping deep levels to 3", () => {
    expect(parseMarkdown("# Focus")).toEqual([
      { kind: "heading", level: 1, text: "Focus" },
    ]);
    expect(parseMarkdown("##### Deep")).toEqual([
      { kind: "heading", level: 3, text: "Deep" },
    ]);
  });

  it("groups consecutive bullets into one list", () => {
    const blocks = parseMarkdown(
      "- increases bargaining leverage\n* alters incentive structure\n+ strengthens the outside option",
    );
    expect(blocks).toEqual([
      {
        kind: "list",
        ordered: false,
        items: [
          "increases bargaining leverage",
          "alters incentive structure",
          "strengthens the outside option",
        ],
      },
    ]);
  });

  it("keeps ordered and unordered lists separate", () => {
    const blocks = parseMarkdown("1. first\n2) second\n- bullet");
    expect(blocks).toEqual([
      { kind: "list", ordered: true, items: ["first", "second"] },
      { kind: "list", ordered: false, items: ["bullet"] },
    ]);
  });

  it("keeps line breaks inside a paragraph", () => {
    expect(parseMarkdown("line one\nline two")).toEqual([
      { kind: "paragraph", text: "line one\nline two" },
    ]);
  });

  it("splits paragraphs on blank lines and ignores trailing whitespace", () => {
    expect(parseMarkdown("first\n\n\nsecond\n  \n")).toEqual([
      { kind: "paragraph", text: "first" },
      { kind: "paragraph", text: "second" },
    ]);
  });

  it("handles a realistic specialization end to end", () => {
    const blocks = parseMarkdown(
      [
        "Malaysia's domestic politics and power dynamics.",
        "",
        "## Use language such as",
        "- increases bargaining leverage",
        "- remains the **rational** choice",
        "",
        "Avoid predicting collapse.",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      {
        kind: "paragraph",
        text: "Malaysia's domestic politics and power dynamics.",
      },
      { kind: "heading", level: 2, text: "Use language such as" },
      {
        kind: "list",
        ordered: false,
        items: [
          "increases bargaining leverage",
          "remains the **rational** choice",
        ],
      },
      { kind: "paragraph", text: "Avoid predicting collapse." },
    ]);
  });

  it("returns nothing for empty input and never drops plain text", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   ")).toEqual([]);
    expect(parseMarkdown("just prose")).toEqual([
      { kind: "paragraph", text: "just prose" },
    ]);
  });
});
