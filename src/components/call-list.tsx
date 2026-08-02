import { Badge } from "./ui";
import { formatTokens } from "@/lib/reports";
import type { LlmCallTrace } from "@/lib/types";
import { stageLabel } from "@/lib/trace-labels";

/** Host of a URL, used as a label when a source carries no title. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

/** Inline "Searched: …" line for Exa tool calls (query lives in the args JSON). */
function exaQuery(call: LlmCallTrace): string | null {
  if (call.stage !== "tool:exa_search") return null;
  try {
    const args = JSON.parse(call.input) as { query?: string };
    return args.query ? `Searched: "${args.query}"` : null;
  } catch {
    return null;
  }
}

export function CallList({
  calls,
  emptyMessage,
}: {
  calls: LlmCallTrace[];
  emptyMessage: string;
}) {
  if (calls.length === 0) {
    return (
      <p className="rounded-md border border-rule bg-neutral-50 px-4 py-8 text-center text-sm text-ink-faint">
        {emptyMessage}
      </p>
    );
  }
  return (
    <ol className="space-y-4">
      {calls.map((call) => {
        // Searches are shown inline — the query IS the content.
        const isSearch = call.stage === "web_search";
        // Empty (or empty-args "{}") sections get no collapsible at all.
        const hasContent = (text: string) => {
          const trimmed = text.trim();
          return trimmed !== "" && trimmed !== "{}";
        };
        const showInstructions = !isSearch && hasContent(call.instructions);
        const showInput = !isSearch && hasContent(call.input);
        return (
          <li
            key={call.index}
            className="rounded-md border border-rule bg-paper"
          >
            <div
              className={
                showInstructions || showInput
                  ? "border-b border-rule px-4 py-3"
                  : "px-4 py-3"
              }
            >
              <p className="text-sm font-semibold leading-snug">
                {call.index}. {stageLabel(call.stage)}
              </p>
              {isSearch && (
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {call.input}
                </p>
              )}
              {isSearch && call.search_results?.length ? (
                <ol className="mt-2 space-y-1.5">
                  {call.search_results.map((result, i) => (
                    <li key={`${result.url}-${i}`} className="flex gap-2 text-xs">
                      <span aria-hidden className="text-ink-faint">
                        {i + 1}.
                      </span>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 leading-relaxed hover:underline"
                      >
                        <span className="block font-medium">
                          {result.title ?? hostOf(result.url)}
                        </span>
                        <span className="block break-all text-ink-faint">
                          {result.url}
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              ) : null}
              {!isSearch && exaQuery(call) && (
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {exaQuery(call)}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge>{call.model}</Badge>
                <Badge>{call.tier} tier</Badge>
                {!isSearch && call.used_web_search && (
                  <Badge tone="active">
                    {call.web_search_calls} web search
                    {call.web_search_calls === 1 ? "" : "es"}
                  </Badge>
                )}
                {call.error && <Badge tone="paused">failed</Badge>}
              </div>
              {!isSearch && (
                <p className="mt-1.5 text-xs text-ink-faint">
                  {(call.duration_ms / 1000).toFixed(1)}s ·{" "}
                  {formatTokens(call.input_tokens)} in /{" "}
                  {formatTokens(call.output_tokens)} out
                </p>
              )}
              {call.error && (
                <p className="mt-1 text-xs text-red-700">{call.error}</p>
              )}
            </div>

            {showInstructions && (
              <details className={showInput ? "border-b border-rule" : ""}>
                <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft hover:bg-neutral-50">
                  Instructions (system prompt)
                </summary>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-rule bg-neutral-50 px-4 py-3 font-mono text-xs leading-relaxed">
                  {call.instructions}
                </pre>
              </details>
            )}

            {showInput && (
              <details>
                <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft hover:bg-neutral-50">
                  Input (task content)
                </summary>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-rule bg-neutral-50 px-4 py-3 font-mono text-xs leading-relaxed">
                  {call.input}
                </pre>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
