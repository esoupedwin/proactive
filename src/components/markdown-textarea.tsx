"use client";

import { useCallback, type ClipboardEvent, type TextareaHTMLAttributes } from "react";
import { htmlToMarkdown } from "@/lib/html-to-markdown";
import { Textarea } from "./ui";

/**
 * A Textarea that keeps formatting when you paste rendered content.
 *
 * Plain-text Markdown already pastes fine, so we only step in when the
 * clipboard also carries `text/html` — copied from a chat answer, a doc, a web
 * page — and convert that to Markdown instead of taking the browser's
 * flattened plain-text version. If anything about the conversion fails we let
 * the native paste happen, so this can only ever add formatting, never lose
 * text.
 */
export function MarkdownTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const html = event.clipboardData.getData("text/html");
      if (!html) return;

      let markdown = "";
      try {
        markdown = htmlToMarkdown(html);
      } catch {
        return;
      }
      const plain = event.clipboardData.getData("text/plain");
      // Nothing gained (or something lost) — let the browser do it.
      if (!markdown || markdown === plain.trim()) return;

      event.preventDefault();
      const el = event.currentTarget;

      // execCommand is deprecated but remains the only insert that keeps the
      // browser's native undo stack intact.
      if (document.execCommand("insertText", false, markdown)) return;

      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      el.value = el.value.slice(0, start) + markdown + el.value.slice(end);
      const caret = start + markdown.length;
      el.setSelectionRange(caret, caret);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    [],
  );

  return <Textarea {...props} onPaste={handlePaste} />;
}
