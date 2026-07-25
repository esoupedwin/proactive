import type { Extract, Topic, TopicMemory } from "../types";
import type { Llm } from "./llm";
import { ExtractionResultSchema } from "./schemas";
import type { SeekOutput } from "./seeker";

/**
 * Extractor — converts found sources into structured extracts, judging
 * relevance and novelty against what the user has already been told.
 */
export async function extractSources(
  llm: Llm,
  topic: Topic,
  found: SeekOutput[],
  memory: TopicMemory,
): Promise<Extract[]> {
  const flat = found.flatMap((f) =>
    f.sources.map((s) => ({ source_type: f.source_type, ...s })),
  );
  if (flat.length === 0) return [];

  const alreadyReported = memory.reported_developments
    .map((d) => `- ${d.text}`)
    .join("\n");

  const result = await llm.structured({
    tier: "search",
    schema: ExtractionResultSchema,
    schemaName: "extraction_result",
    instructions: [
      "You are the extractor for a personal research companion.",
      "Convert each found source into a structured extract.",
      "Judge novelty against the list of developments the user was ALREADY told:",
      "- 'repeat' if it only restates something already reported,",
      "- 'update' if it meaningfully develops something already reported,",
      "- 'new' if the user has not been told about it.",
      "Flag contradictions with prior knowledge or between sources in the contradiction field (empty string if none).",
      "Drop sources that are clearly irrelevant to the topic by omitting them.",
      "Keep every field grounded in the provided snippet/title — never invent facts, dates, or URLs.",
    ].join("\n"),
    input: JSON.stringify(
      {
        topic: {
          title: topic.title,
          goal: topic.description,
          interest_areas: topic.interest_areas,
        },
        already_reported_developments: alreadyReported || "(nothing yet)",
        known_facts: memory.facts.map((f) => f.fact),
        found_sources: flat,
      },
      null,
      2,
    ),
  });

  return result.extracts;
}
