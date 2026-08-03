import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "@/lib/html-to-markdown";
import { parseMarkdown } from "@/lib/markdown";

describe("htmlToMarkdown", () => {
  it("converts headings and paragraphs", () => {
    expect(htmlToMarkdown("<h2>Use language such as</h2><p>Stay neutral.</p>"))
      .toBe("## Use language such as\n\nStay neutral.");
  });

  it("clamps nothing below h6 and keeps each level", () => {
    expect(htmlToMarkdown("<h1>A</h1><h6>B</h6>")).toBe("# A\n\n###### B");
  });

  it("converts unordered and ordered lists", () => {
    expect(
      htmlToMarkdown("<ul><li>increases leverage</li><li>alters incentives</li></ul>"),
    ).toBe("- increases leverage\n- alters incentives");

    expect(htmlToMarkdown("<ol><li>first</li><li>second</li></ol>")).toBe(
      "1. first\n2. second",
    );
  });

  it("indents nested lists", () => {
    expect(
      htmlToMarkdown("<ul><li>outer<ul><li>inner</li></ul></li></ul>"),
    ).toBe("- outer\n  - inner");
  });

  it("converts inline emphasis and code", () => {
    expect(
      htmlToMarkdown("<p>It <strong>raises</strong> the <em>cost</em> of <code>exit</code>.</p>"),
    ).toBe("It **raises** the *cost* of `exit`.");
  });

  it("converts links and drops href-less anchors", () => {
    expect(htmlToMarkdown('<a href="https://example.com">Example</a>')).toBe(
      "[Example](https://example.com)",
    );
    expect(htmlToMarkdown("<a>no href</a>")).toBe("no href");
  });

  it("converts code blocks to fences", () => {
    expect(htmlToMarkdown("<pre><code>line one\nline two</code></pre>")).toBe(
      "```\nline one\nline two\n```",
    );
  });

  it("decodes named and numeric entities", () => {
    expect(htmlToMarkdown("<p>A &amp; B &mdash; C &#39;D&#39; &#x2018;E&#x2019;</p>")).toBe(
      "A & B — C 'D' ‘E’",
    );
  });

  it("strips scripts, styles and editor comments", () => {
    expect(
      htmlToMarkdown(
        "<!--StartFragment--><style>p{color:red}</style><script>alert(1)</script><p>Kept</p>",
      ),
    ).toBe("Kept");
  });

  it("keeps text from unknown tags instead of dropping it", () => {
    expect(htmlToMarkdown('<span class="x"><mark>important</mark></span>')).toBe(
      "important",
    );
  });

  it("collapses HTML source whitespace but keeps block breaks", () => {
    const html = `
      <h2>  Focus  </h2>
      <ul>
        <li>  spaced   item  </li>
      </ul>
    `;
    expect(htmlToMarkdown(html)).toBe("## Focus\n\n- spaced item");
  });

  it("returns an empty string for markup with no text", () => {
    expect(htmlToMarkdown("<div><span></span></div>")).toBe("");
    expect(htmlToMarkdown("")).toBe("");
  });

  it("round-trips into the block parser the field renders with", () => {
    const markdown = htmlToMarkdown(
      "<p>Malaysia's politics.</p><h2>Use language such as</h2><ul><li>increases <strong>bargaining</strong> leverage</li><li>alters incentive structure</li></ul>",
    );
    expect(parseMarkdown(markdown)).toEqual([
      { kind: "paragraph", text: "Malaysia's politics." },
      { kind: "heading", level: 2, text: "Use language such as" },
      {
        kind: "list",
        ordered: false,
        items: [
          "increases **bargaining** leverage",
          "alters incentive structure",
        ],
      },
    ]);
  });
});
