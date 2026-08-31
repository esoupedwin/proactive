import { z } from "zod";
import { interestFrameInstructions } from "../prompts";
import type { InterestFactor } from "../types";
import type { Llm } from "./llm";

/**
 * Drafts an Interest Frame for a topic: the analytical factors to watch, each
 * with a key question and observable indicators. The user reviews and edits
 * the draft in the topic form before saving — this is a starting point, not
 * the stored truth.
 */

export const InterestFrameSchema = z.object({
  factors: z
    .array(
      z.object({
        name: z
          .string()
          .describe("Short factor name, 2-4 words, e.g. 'Political Incentives'"),
        key_question: z
          .string()
          .describe("The one question this factor should answer for the topic"),
        indicators: z
          .array(z.string())
          .describe("2-4 concrete observable indicators, each a short phrase"),
      }),
    )
    .min(3)
    .max(7)
    .describe("The distinct analytical factors that drive this topic"),
});

export interface InterestFrameInput {
  title: string;
  description: string;
  /** Set when the topic answers an analytical question. */
  analytical_question?: string | null;
}

export async function generateInterestFrame(
  llm: Llm,
  topic: InterestFrameInput,
): Promise<InterestFactor[]> {
  const result = await llm.structured({
    tier: "search",
    schema: InterestFrameSchema,
    schemaName: "interest_frame",
    // Text in lib/prompts.ts, the app-wide prompt catalog.
    instructions: interestFrameInstructions(),
    input: JSON.stringify({
      title: topic.title,
      goal: topic.description,
      analytical_question: topic.analytical_question || null,
    }),
  });
  return result.factors.map((f) => ({
    name: f.name.trim(),
    key_question: f.key_question.trim(),
    indicators: f.indicators.map((i) => i.trim()).filter(Boolean),
  }));
}
