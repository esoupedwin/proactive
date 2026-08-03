/**
 * A deliberately small Markdown block parser for user-authored prompt text
 * (the Analyst's specialization). It covers the subset people actually reach
 * for when writing instructions — headings, bullet and numbered lists, and
 * paragraphs — and leaves inline emphasis to `parseMarkedText`, which the
 * report renderer already uses for **entity** markers.
 *
 * Anything it does not recognise stays verbatim, so no input is ever lost.
 */

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; text: string };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^\s*[-*+]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Splits Markdown into renderable blocks. Consecutive plain lines stay in one
 * paragraph with their line breaks intact — in prompt guidance a line break is
 * usually meaningful, so we keep it rather than reflowing.
 */
export function parseMarkdown(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") {
      flush();
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        // Deeper levels would be visually indistinguishable here.
        level: Math.min(heading[1]!.length, 3) as 1 | 2 | 3,
        text: heading[2]!.trim(),
      });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    const ordered = bullet ? null : ORDERED_RE.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = ordered !== null;
      // A change of list type starts a new list.
      if (list && list.ordered !== isOrdered) flushList();
      list ??= { ordered: isOrdered, items: [] };
      list.items.push((bullet?.[1] ?? ordered?.[1] ?? "").trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flush();
  return blocks;
}
