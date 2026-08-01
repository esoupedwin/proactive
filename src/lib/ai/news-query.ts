import { z } from "zod";
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
    instructions: [
      "You write ONE reusable news-search query for a topic the user follows.",
      "The query is stored and reused for months, so capture the topic's evergreen core — no dates, no recency words, no site: or quote operators.",
      "3-8 words, using the terms a news editor would use.",
    ].join("\n"),
    input: JSON.stringify({
      title: topic.title,
      goal: topic.description,
      interest_areas: topic.interest_areas,
    }),
  });
  return result.query.trim();
}
