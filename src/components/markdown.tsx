import { Fragment } from "react";
import { parseMarkedText } from "@/lib/entities";
import { parseMarkdown } from "@/lib/markdown";

/** Inline **bold**, the same marker the report renderer honours. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {parseMarkedText(text).map((segment, i) =>
        segment.bold ? (
          <strong key={i} className="font-semibold">
            {segment.text}
          </strong>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

const HEADING_CLASS = {
  1: "text-sm font-bold",
  2: "text-sm font-semibold",
  3: "text-xs font-semibold uppercase tracking-wide",
} as const;

/**
 * Renders the Markdown subset from `parseMarkdown` in the app's editorial
 * style. Used for user-authored prompt text such as the Analyst's
 * specialization.
 */
export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          const Tag = `h${block.level + 2}` as "h3" | "h4" | "h5";
          return (
            <Tag key={i} className={HEADING_CLASS[block.level]}>
              <Inline text={block.text} />
            </Tag>
          );
        }
        if (block.kind === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag
              key={i}
              className={
                block.ordered
                  ? "list-decimal space-y-1 pl-5"
                  : "list-disc space-y-1 pl-5"
              }
            >
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} />
                </li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
