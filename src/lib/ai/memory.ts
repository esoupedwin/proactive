import { stripEntityMarkers } from "../entities";
import type { Extract, Topic, TopicMemory } from "../types";
import type { Llm } from "./llm";
import { MemoryUpdateSchema } from "./schemas";
import type { MemoryUpdate, ReportDraft } from "./schemas";

// Caps keep memory bounded as topics age.
const MAX_DEVELOPMENTS = 60;
const MAX_FACTS = 30;
const MAX_THEMES = 12;
const MAX_QUESTIONS = 12;

const normalize = (text: string) => text.trim().toLowerCase();

/**
 * Applies a memory delta to existing memory. Pure and deterministic — the
 * model only reports what changed, so unchanged memory is never re-emitted
 * (which used to make this the most expensive call in the pipeline).
 */
export function mergeMemoryDelta(
  memory: TopicMemory,
  update: MemoryUpdate,
  now: string,
): Omit<TopicMemory, "topic_id" | "user_id"> {
  // --- Developments: newest first, deduped against what was already told.
  const seenDevelopments = new Set(
    memory.reported_developments.map((d) => normalize(d.text)),
  );
  const freshDevelopments = update.new_developments
    .map((d) => stripEntityMarkers(d.text).trim())
    .filter((text) => {
      const key = normalize(text);
      if (!text || seenDevelopments.has(key)) return false;
      seenDevelopments.add(key);
      return true;
    })
    .map((text) => ({
      id: crypto.randomUUID(),
      text,
      first_reported_at: now,
    }));

  // --- Facts: drop superseded, prepend new, dedupe by fact text.
  const obsoleteFacts = new Set(update.obsolete_facts.map(normalize));
  const keptFacts = memory.facts.filter(
    (f) => !obsoleteFacts.has(normalize(f.fact)),
  );
  const knownFacts = new Set(keptFacts.map((f) => normalize(f.fact)));
  const freshFacts = update.new_facts.filter((f) => {
    const key = normalize(f.fact);
    if (!f.fact.trim() || knownFacts.has(key)) return false;
    knownFacts.add(key);
    return true;
  });

  // --- Themes: a re-stated theme replaces the old one (trend may have moved).
  const obsoleteThemes = new Set(update.obsolete_themes.map(normalize));
  const restatedThemes = new Set(update.new_themes.map((t) => normalize(t.theme)));
  const keptThemes = memory.themes.filter(
    (t) =>
      !obsoleteThemes.has(normalize(t.theme)) &&
      !restatedThemes.has(normalize(t.theme)),
  );

  // --- Questions: drop resolved, prepend new, dedupe.
  const resolved = new Set(update.resolved_questions.map(normalize));
  const keptQuestions = memory.open_questions.filter(
    (q) => !resolved.has(normalize(q.question)),
  );
  const knownQuestions = new Set(keptQuestions.map((q) => normalize(q.question)));
  const freshQuestions = update.new_questions.filter((q) => {
    const key = normalize(q.question);
    if (!q.question.trim() || knownQuestions.has(key)) return false;
    knownQuestions.add(key);
    return true;
  });

  return {
    reported_developments: [
      ...freshDevelopments,
      ...memory.reported_developments,
    ].slice(0, MAX_DEVELOPMENTS),
    facts: [...freshFacts, ...keptFacts].slice(0, MAX_FACTS),
    themes: [...update.new_themes, ...keptThemes].slice(0, MAX_THEMES),
    open_questions: [...freshQuestions, ...keptQuestions].slice(0, MAX_QUESTIONS),
    updated_at: now,
  };
}

/**
 * Memory updater — folds the new report and extracts into topic memory:
 * reported developments, emerging themes, key facts, and open questions.
 * The model returns only the delta; merging happens in code.
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
    bullets.map((b) => stripEntityMarkers(b.text));

  const update = await llm.structured({
    // Search tier, not report tier: since memory moved to deltas this is
    // structured extraction (what changed?) rather than synthesis. The
    // expensive model is reserved for the briefing the user actually reads.
    tier: "search",
    schema: MemoryUpdateSchema,
    schemaName: "memory_update",
    instructions: [
      "You are the memory updater for a personal research companion.",
      "Report ONLY what this report CHANGES about the topic's long-term memory — a delta, never the full memory. Anything you omit is preserved automatically.",
      "- new_developments: only things the user was told for the first time in this report. If the report repeats what memory already holds, return an empty list.",
      "- new_facts: durable, verifiable knowledge not already in current memory, with named entities and a confidence level.",
      "- obsolete_facts: existing facts contradicted or superseded by new evidence. To revise a fact, list its exact existing text here AND add the corrected version to new_facts.",
      "- new_themes: emerging narratives, or an existing theme whose direction of travel changed (restating a theme replaces it).",
      "- obsolete_themes / resolved_questions: use the exact existing text so it can be matched.",
      "- new_questions: unresolved claims, contradictions, or things to watch that this report raised.",
      "Only record information grounded in the report or extracts. Empty lists are the correct answer when nothing changed.",
      `Memory is capped at ${MAX_DEVELOPMENTS} developments, ${MAX_FACTS} facts, ${MAX_THEMES} themes and ${MAX_QUESTIONS} questions; oldest entries are dropped automatically.`,
    ].join("\n"),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      current_memory: {
        reported_developments: memory.reported_developments.map((d) => d.text),
        themes: memory.themes,
        facts: memory.facts,
        open_questions: memory.open_questions,
      },
      new_report: {
        takeaway: stripEntityMarkers(draft.cross_source_takeaway),
        latest_developments: stripBullets(draft.latest_developments),
        community_reaction: stripBullets(draft.community_reaction),
        practitioner_view: stripBullets(draft.practitioner_view),
        what_changed: stripBullets(draft.what_changed),
      },
      new_extracts: extracts.map((e) => ({
        source_type: e.source_type,
        gist: e.gist,
        novelty: e.novelty,
        contradiction: e.contradiction,
      })),
    }),
  });

  return {
    topic_id: topic.id,
    user_id: topic.user_id,
    ...mergeMemoryDelta(memory, update, new Date().toISOString()),
  };
}
