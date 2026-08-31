import { z } from "zod";
import { explainInstructions } from "../prompts";
import type { Topic } from "../types";
import type { Llm } from "./llm";

/**
 * "Tell me more" — explains a passage the user highlighted in a briefing:
 * what it is, and the additional context that makes it meaningful for this
 * topic. Runs on the search tier with the web_search tool AVAILABLE but not
 * mandatory — the model searches only when its own knowledge isn't enough
 * (unfamiliar names, current facts), so quick lookups stay cheap.
 */

/** Bounds mirrored by the API route; a selection outside them is a mistake. */
export const EXPLAIN_SELECTION_MAX = 600;
export const EXPLAIN_CONTEXT_MAX = 800;

export const ExplainSchema = z.object({
  explanation: z
    .string()
    .describe(
      "3-6 sentences of plain prose: what the highlighted content is, then the context that makes it meaningful for this topic. No headings or bullet points.",
    ),
});

export async function explainSelection(
  llm: Llm,
  topic: Pick<Topic, "title" | "description">,
  selection: string,
  context: string,
): Promise<{ explanation: string }> {
  const result = await llm.structured({
    tier: "search",
    schema: ExplainSchema,
    schemaName: "explain_selection",
    useWebSearch: true,
    // Text in lib/prompts.ts, the app-wide prompt catalog.
    instructions: explainInstructions(),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      highlighted: selection.slice(0, EXPLAIN_SELECTION_MAX),
      surrounding_passage: context.slice(0, EXPLAIN_CONTEXT_MAX),
    }),
  });

  return { explanation: result.explanation.trim() };
}
