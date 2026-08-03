/**
 * Converts an HTML clipboard fragment to Markdown.
 *
 * When you copy from a rendered source — a chat answer, a doc, a web page —
 * the clipboard carries both `text/html` and a flattened `text/plain` that has
 * lost every heading and bullet. Pasting into a textarea normally takes the
 * flattened version; this recovers the structure instead.
 *
 * Deliberately small: a linear tokenizer over the semantic tags people
 * actually paste, no dependency, pure string in / string out so it is testable
 * without a DOM. Unknown tags are dropped and their text kept, so a paste is
 * never worse than the plain-text fallback.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1]?.toLowerCase() === "x"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

interface ListLevel {
  ordered: boolean;
  index: number;
}

/** Converts an HTML fragment to Markdown. Returns "" when there is no text. */
export function htmlToMarkdown(html: string): string {
  // Comments (Word's StartFragment markers) and non-content elements first.
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, "");

  let out = "";
  const lists: ListLevel[] = [];
  let inPre = false;
  let linkHref: string | null = null;
  let linkStart = 0;

  const TOKEN_RE = /<\/?([a-z][a-z0-9]*)\b([^>]*)>|([^<]+)/gi;

  for (const match of cleaned.matchAll(TOKEN_RE)) {
    const [raw, rawName, attrs, text] = match;

    if (text !== undefined) {
      const decoded = decodeEntities(text);
      out += inPre ? decoded : decoded.replace(/\s+/g, " ");
      continue;
    }

    const tag = rawName!.toLowerCase();
    const closing = raw.startsWith("</");

    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const level = Math.min(Number(tag[1]), 6);
        out += closing ? "\n\n" : `\n\n${"#".repeat(level)} `;
        break;
      }
      case "p":
      case "div":
      case "section":
      case "article":
      case "tr":
        if (closing) out += "\n\n";
        break;
      case "br":
        out += "\n";
        break;
      case "hr":
        out += "\n\n---\n\n";
        break;
      case "ul":
      case "ol":
        if (closing) {
          lists.pop();
          if (lists.length === 0) out += "\n\n";
        } else {
          // Only the outermost list needs a break before it — each <li>
          // supplies its own newline, and a blank line would split the list.
          if (lists.length === 0) out += "\n\n";
          lists.push({ ordered: tag === "ol", index: 0 });
        }
        break;
      case "li": {
        if (closing) break;
        const level = lists[lists.length - 1];
        const indent = "  ".repeat(Math.max(lists.length - 1, 0));
        if (level?.ordered) {
          level.index += 1;
          out += `\n${indent}${level.index}. `;
        } else {
          out += `\n${indent}- `;
        }
        break;
      }
      case "strong":
      case "b":
        out += "**";
        break;
      case "em":
      case "i":
        out += "*";
        break;
      case "del":
      case "s":
        out += "~~";
        break;
      case "pre":
        inPre = !closing;
        out += closing ? "\n```\n\n" : "\n\n```\n";
        break;
      case "code":
        // Inside <pre> the fence already marks it as code.
        if (!inPre) out += "`";
        break;
      case "blockquote":
        out += closing ? "\n\n" : "\n\n> ";
        break;
      case "a": {
        if (closing) {
          // Drop the link syntax when it would wrap empty text or has no href.
          if (linkHref && out.length > linkStart) out += `](${linkHref})`;
          else if (linkHref) out = out.slice(0, linkStart - 1);
          linkHref = null;
        } else {
          const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
            attrs ?? "",
          );
          linkHref = href?.[2] ?? href?.[3] ?? href?.[4] ?? null;
          if (linkHref) {
            out += "[";
            linkStart = out.length;
          }
        }
        break;
      }
      default:
        break;
    }
  }

  // Tidy each line separately so nested-list indentation survives.
  return out
    .split("\n")
    .map((line) => {
      const indent = /^[ \t]*/.exec(line)![0];
      const body = line
        .slice(indent.length)
        .replace(/[ \t]{2,}/g, " ")
        .trimEnd();
      return body ? indent + body : "";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
