import { z } from "zod";
import { newsQueryInstructions } from "../prompts";
import type { Llm } from "./llm";

/**
 * Formulates the ONE reusable news-search query stored on a topic at setup
 * time and reused for every "Related news" search.
 */

export const NewsQuerySchema = z.object({
  query: z
    .string()
    .describe("A single reusable news search query, 3-8 words, no site: or date operators"),
});

export interface NewsQueryTopic {
  title: string;
  description: string;
  interest_areas: string[];
}

export async function generateNewsQuery(
  llm: Llm,
  topic: NewsQueryTopic,
): Promise<string> {
  const result = await llm.structured({
    tier: "search",
    schema: NewsQuerySchema,
    schemaName: "news_query",
    // Text in lib/prompts.ts, the app-wide prompt catalog.
    instructions: newsQueryInstructions(),
    input: JSON.stringify({
      title: topic.title,
      goal: topic.description,
      interest_areas: topic.interest_areas,
    }),
  });
  return result.query.trim();
}
