import { z } from "zod";
import { sentimentInstructions } from "../../prompts";
import type { ReportSections, SentimentReading, Topic } from "../../types";
import type { Llm } from "../llm";
import { plainReportText } from "./report-text";

/**
 * Sentiment — reads the generated report, searches Reddit for public reaction
 * to its main points, and writes a short reading of the sentiment: what
 * communities are saying, how it leans, and where it diverges from the
 * report's own framing.
 */

export const SentimentSchema = z.object({
  points: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe(
      "2-5 point-form findings on public sentiment around the report's main points, each a single standalone sentence grounded in what Reddit discussions actually say.",
    ),
});

export async function runSentiment(
  llm: Llm,
  topic: Topic,
  sections: ReportSections,
): Promise<{ sentiment: SentimentReading }> {
  const result = await llm.structured({
    // Search tier: this is retrieval-and-read work, like the mentor's
    // entity fact-checking — the web_search tool does the heavy lifting.
    tier: "search",
    schema: SentimentSchema,
    schemaName: "sentiment_reading",
    useWebSearch: true,
    // Text in lib/prompts.ts, the app-wide prompt catalog.
    instructions: sentimentInstructions(),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      report: plainReportText(sections),
    }),
  });

  return {
    sentiment: {
      points: result.points.map((p) => p.trim()).filter(Boolean),
    },
  };
}
