import { z } from "zod";
import type { Llm } from "../../ai/llm";
import {
  MAX_SITUATION_FACTS,
  renderSituation,
  situationInstructions,
} from "../../prompts";
import type {
  FactKind,
  KnowledgeFact,
  SituationFact,
  Topic,
} from "../../types";
import type { SituationUpdate } from "../schemas";

// The instruction text (and the fact cap quoted inside it) lives in
// lib/prompts.ts; re-exported here so existing importers keep their path.
export { MAX_SITUATION_FACTS, renderSituation };

/**
 * The Reporter's standing facts for a question topic — the context a verdict
 * needs that no single news extract supplies: what the outcome actually
 * requires (the "rule"), and where things stand today (the "state").
 *
 * Established ONCE, by a bounded web-search call before the first assessment
 * (`establishSituation`). The agent loop itself never holds a search tool:
 * later runs revise state facts only from extracts they already have
 * (`applySituationUpdates`), so the reporter cannot drift into researching
 * the news it is meant to assess from the store. Facts live in
 * topic_memory.facts; the user can correct or clear them.
 */

export const SituationSchema = z.object({
  facts: z
    .array(
      z.object({
        fact: z
          .string()
          .describe(
            "One standing fact in a single sentence, specific (numbers, names, dates). State facts say what is true NOW; rule facts say what the outcome requires or how the mechanism works.",
          ),
        kind: z
          .enum(["rule", "state"])
          .describe(
            "'rule' for stable structural facts (thresholds, procedures); 'state' for the current position that can change",
          ),
        entities: z
          .array(z.string())
          .describe("The named people, organisations, or bodies in this fact"),
        confidence: z
          .enum(["high", "medium", "low"])
          .describe("How well the sources agree on this fact"),
        source_note: z
          .string()
          .describe("Where this comes from, briefly, e.g. 'Senate.gov party division page'"),
        as_of: z
          .string()
          .nullable()
          .describe("State facts: the date this was true, YYYY-MM-DD. Null for rules."),
      }),
    )
    .min(1)
    .max(MAX_SITUATION_FACTS)
    .describe(
      `The ${MAX_SITUATION_FACTS} or fewer facts an analyst must know before assessing the question, rules first then state`,
    ),
});

/**
 * Establishes the fact base with a bounded web search. Called only when the
 * topic has no facts yet, so a topic pays this cost once (or again after the
 * user clears them).
 */
export async function establishSituation(
  llm: Llm,
  topic: Topic,
): Promise<KnowledgeFact[]> {
  const result = await llm.structured({
    // Search tier: retrieval-and-read, like the Personality baseline — the
    // judgement happens later, in the report-tier agent loop.
    tier: "search",
    schema: SituationSchema,
    schemaName: "situation",
    useWebSearch: true,
    instructions: situationInstructions(topic),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      question: topic.analytical_question,
      key_factors: topic.interest_frame.map((f) => f.name),
    }),
  });

  return result.facts.map((f) => ({
    fact: f.fact.trim(),
    kind: f.kind,
    entities: f.entities.map((e) => e.trim()).filter(Boolean),
    confidence: f.confidence,
    source_note: f.source_note.trim(),
    as_of: f.kind === "state" ? f.as_of : null,
  }));
}

/**
 * Folds the agent loop's revisions into the fact base (pure). Only state
 * facts may change — a rule is structural, and a "revision" to one is far
 * more likely a misreading than a real change. Unknown fact text is ignored
 * rather than appended, so the loop cannot grow the base without searching.
 * Returns the new base and which facts moved, for the report snapshot.
 */
/**
 * Source note stamped by updateTopicFact when the user corrects a fact by
 * hand. A fact carrying it is theirs: the reporter's revisions skip it, so
 * the panel's promise that corrections stick is enforced here, not just
 * documented. Editing the fact again or re-establishing lifts the hold.
 */
export const USER_CORRECTED_NOTE = "Corrected by you";

export function applySituationUpdates(
  facts: KnowledgeFact[],
  updates: SituationUpdate[],
): { facts: KnowledgeFact[]; revised: Set<string> } {
  const byText = new Map(updates.map((u) => [u.fact.trim(), u]));
  const revised = new Set<string>();
  const next = facts.map((f) => {
    const update = byText.get(f.fact.trim());
    if (!update || f.kind === "rule" || f.source_note === USER_CORRECTED_NOTE) {
      return f;
    }
    const text = update.revised_fact.trim();
    if (!text || text === f.fact) return f;
    revised.add(text);
    return {
      ...f,
      fact: text,
      as_of: update.as_of ?? f.as_of ?? null,
      source_note: `Revised from report evidence (was: ${f.fact})`,
    };
  });
  return { facts: next, revised };
}

/** Facts from before this feature have no kind; treat them as state. */
export function factKind(f: KnowledgeFact): FactKind {
  return f.kind ?? "state";
}

/** The report's snapshot of the fact base, rules first then state. */
export function situationSnapshot(
  facts: KnowledgeFact[],
  revised: Set<string> = new Set(),
): SituationFact[] {
  const order: Record<FactKind, number> = { rule: 0, state: 1 };
  return [...facts]
    .sort((a, b) => order[factKind(a)] - order[factKind(b)])
    .map((f) => ({
      fact: f.fact,
      kind: factKind(f),
      as_of: f.as_of ?? null,
      ...(revised.has(f.fact) ? { revised: true } : {}),
    }));
}

