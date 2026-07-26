import { stripEntityMarkers } from "../entities";
import type { Extract, Topic, TopicMemory } from "../types";
import type { Llm } from "./llm";
import { MemoryUpdateSchema } from "./schemas";
import type { ReportDraft } from "./schemas";

// Caps keep memory bounded as topics age.
const MAX_DEVELOPMENTS = 60;
const MAX_FACTS = 30;
const MAX_THEMES = 12;
const MAX_QUESTIONS = 12;

/**
 * Memory updater — folds the new report and extracts into topic memory:
 * reported developments, emerging themes, key facts, and open questions.
 */
export async function updateTopicMemory(
  llm: Llm,
  topic: Topic,
  memory: TopicMemory,
  draft: ReportDraft,
  extracts: Extract[],
): Promise<TopicMemory> {
  // Memory stores plain text — drop the report's inline **entity** markers.
  const stripBullets = (bullets: ReportDraft["latest_developments"]) =>
    bullets.map((b) => ({ ...b, text: stripEntityMarkers(b.text) }));
  const plainDraft: ReportDraft = {
    ...draft,
    latest_developments: stripBullets(draft.latest_developments),
    community_reaction: stripBullets(draft.community_reaction),
    practitioner_view: stripBullets(draft.practitioner_view),
    what_changed: stripBullets(draft.what_changed),
    cross_source_takeaway: stripEntityMarkers(draft.cross_source_takeaway),
    summary: stripEntityMarkers(draft.summary),
  };
  const update = await llm.structured({
    tier: "report",
    schema: MemoryUpdateSchema,
    schemaName: "memory_update",
    instructions: [
      "You are the memory updater for a personal research companion.",
      "Merge the new report into the topic's long-term memory. Return the FULL updated memory, not a delta.",
      "- reported_developments: everything the user has now been told, most recent first. Merge near-duplicates. Keep each under 25 words.",
      `- Keep at most ${MAX_DEVELOPMENTS} developments, ${MAX_FACTS} facts, ${MAX_THEMES} themes, ${MAX_QUESTIONS} open questions; drop the least important/oldest.`,
      "- facts: durable, verifiable knowledge with named entities and a confidence level. Downgrade or remove facts contradicted by new evidence.",
      "- themes: emerging narratives with their direction of travel (trend).",
      "- open_questions: unresolved claims, contradictions, or things to watch.",
      "Only record information grounded in the report or extracts.",
    ].join("\n"),
    input: JSON.stringify(
      {
        topic: { title: topic.title, goal: topic.description },
        current_memory: {
          reported_developments: memory.reported_developments,
          themes: memory.themes,
          facts: memory.facts,
          open_questions: memory.open_questions,
        },
        new_report: plainDraft,
        new_extracts: extracts.map((e) => ({
          source_type: e.source_type,
          gist: e.gist,
          novelty: e.novelty,
          contradiction: e.contradiction,
        })),
      },
      null,
      2,
    ),
  });

  const now = new Date().toISOString();
  const previousByText = new Map(
    memory.reported_developments.map((d) => [d.text, d]),
  );

  return {
    topic_id: topic.id,
    user_id: topic.user_id,
    reported_developments: update.reported_developments
      .slice(0, MAX_DEVELOPMENTS)
      .map((d) => {
        const text = stripEntityMarkers(d.text);
        const existing = previousByText.get(text);
        return {
          id: existing?.id ?? crypto.randomUUID(),
          text,
          first_reported_at: existing?.first_reported_at ?? now,
        };
      }),
    themes: update.themes.slice(0, MAX_THEMES),
    facts: update.facts.slice(0, MAX_FACTS),
    open_questions: update.open_questions.slice(0, MAX_QUESTIONS),
    updated_at: now,
  };
}
