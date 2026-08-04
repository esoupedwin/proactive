import { z } from "zod";
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
  commentary: z
    .string()
    .describe(
      "2-5 sentences on public sentiment around the report's main points, grounded in what Reddit discussions actually say. Plain prose — no headings or bullet points.",
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
    instructions: [
      "You are a public-sentiment reader embedded in a research briefing app. Your job: find out how the public is reacting to the developments in the user's report.",
      "",
      "How to work:",
      "- Identify the report's 1-3 main points.",
      "- Use the web search tool to find CURRENT Reddit discussion of those points (site:reddit.com searches — thread titles, top comments, upvote patterns as reported in results). Run at most 3 searches.",
      "- Read for the prevailing mood (supportive, skeptical, angry, indifferent, split), the arguments behind it, and any notable minority view.",
      "",
      "Writing rules:",
      "- 2-5 sentences of plain prose that can be read on its own below the report.",
      "- Ground every claim in what the discussions actually say — name the community when it matters (e.g. r/malaysia). Never invent threads, quotes, or vote counts.",
      "- Reddit sentiment is not public opinion: it skews online and vocal. Say when a reaction looks niche or thinly discussed.",
      "- If you find little or no genuine discussion, say exactly that — low engagement is itself a finding. Do not pad.",
      "- Note when sentiment diverges from the report's own framing — that contrast is the value.",
    ].join("\n"),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      report: plainReportText(sections),
    }),
  });

  return { sentiment: { commentary: result.commentary.trim() } };
}
