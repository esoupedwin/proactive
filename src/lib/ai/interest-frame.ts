import { z } from "zod";
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
    instructions: [
      "You design an Interest Frame: the analytical factors that determine how a topic develops, for a research-tracking app.",
      "Each factor gets a short name, ONE key question the factor should answer, and 2-4 concrete observable indicators (the kind of evidence news or discussion would surface).",
      "Factors must be mutually distinct and collectively cover the topic; 3-7 factors, most decisive first.",
      "When an analytical question is given, the factors are the considerations that decide its answer — include a trigger-events factor for developments that could change the calculus.",
    ].join("\n"),
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
