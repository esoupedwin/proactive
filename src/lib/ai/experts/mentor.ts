import { z } from "zod";
import { stripEntityMarkers } from "../../entities";
import type {
  MentorLevel,
  MentorMemoryData,
  MentorTip,
  ReportSections,
  Topic,
} from "../../types";
import type { Llm } from "../llm";

/**
 * Mentor — the first "expert": reads a generated report and teaches the user
 * key concepts, entities, and relationships the report assumes ("did you
 * know" tips). It remembers what it taught and respects user feedback:
 * concepts marked "known" are never re-taught; "revisit" ones come back.
 */

const MAX_TIPS = 3;
const MAX_TAUGHT_CONCEPTS = 100;

const LEVEL_GUIDANCE: Record<MentorLevel, string> = {
  basic:
    "The user is NEW to this topic. Explain like a patient teacher: plain language, no jargon, spell out acronyms, give the 'why it matters' in everyday terms.",
  intermediate:
    "The user has working knowledge. Skip the basics; explain mid-level context, connections between actors, and background developments concisely.",
  advanced:
    "The user is well-versed. Only surface non-obvious context: second-order relationships, historical precedents, institutional mechanics. Be dense and precise.",
};

export const MentorTipsSchema = z.object({
  tips: z
    .array(
      z.object({
        concept: z
          .string()
          .describe("Short name of the concept, entity, or relationship being explained"),
        tip: z
          .string()
          .describe("2-4 sentence explanation adapted to the user's level"),
      }),
    )
    .describe(`0 to ${MAX_TIPS} tips; return fewer or none if nothing needs explaining`),
});

export const MentorMoreSchema = z.object({
  more: z
    .string()
    .describe("A deeper follow-up explanation building on the original tip, 3-6 sentences"),
});

/** Concepts the user said they already know — never teach these again. */
export function knownConcepts(memory: MentorMemoryData): string[] {
  return memory.taught
    .filter((t) => t.status === "known")
    .map((t) => t.concept);
}

/** Concepts the user asked to be reminded about. */
export function revisitConcepts(memory: MentorMemoryData): string[] {
  return memory.taught
    .filter((t) => t.status === "revisit")
    .map((t) => t.concept);
}

/** Folds newly taught tips into mentor memory (pure, unit-testable). */
export function mergeTaughtConcepts(
  memory: MentorMemoryData,
  tips: Array<{ concept: string }>,
  now: string,
): MentorMemoryData {
  const byKey = new Map(
    memory.taught.map((t) => [t.concept.toLowerCase(), { ...t }]),
  );
  for (const tip of tips) {
    const key = tip.concept.trim().toLowerCase();
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      existing.times += 1;
      existing.last_taught_at = now;
      // Re-teaching a 'revisit' concept satisfies the reminder.
      if (existing.status !== "known") existing.status = "taught";
    } else {
      byKey.set(key, {
        concept: tip.concept.trim(),
        status: "taught",
        times: 1,
        last_taught_at: now,
      });
    }
  }
  const taught = [...byKey.values()]
    .sort((a, b) => b.last_taught_at.localeCompare(a.last_taught_at))
    .slice(0, MAX_TAUGHT_CONCEPTS);
  return { taught };
}

/** Flattens report sections into plain teaching material. */
function plainReportText(sections: ReportSections): string {
  const bullets = [
    ...sections.latest_developments,
    ...sections.community_reaction,
    ...sections.practitioner_view,
    ...sections.what_changed,
  ].map((b) => `- ${stripEntityMarkers(b.text)}`);
  return [stripEntityMarkers(sections.cross_source_takeaway), ...bullets].join("\n");
}

export async function runMentor(
  llm: Llm,
  topic: Topic,
  sections: ReportSections,
  level: MentorLevel,
  memory: MentorMemoryData,
): Promise<{ tips: MentorTip[]; memory: MentorMemoryData }> {
  const result = await llm.structured({
    tier: "search",
    schema: MentorTipsSchema,
    schemaName: "mentor_tips",
    instructions: [
      "You are Mentor, a personal tutor embedded in a research briefing app. Your goal is to steadily improve the user's understanding of their topic.",
      LEVEL_GUIDANCE[level],
      "",
      "Read the report and pick the concepts, entities, acronyms, or relationships it ASSUMES but a reader at this level may not know (e.g. 'what is JS-SEZ', 'what is the relationship between Anwar Ibrahim and Ahmad Zahid Hamidi').",
      `Write at most ${MAX_TIPS} 'did you know'-style tips. Fewer is fine; return none if nothing needs explaining.`,
      "Rules:",
      "- NEVER explain a concept in the 'already known' list — the user confirmed they know it.",
      "- PREFER concepts in the 'asked to revisit' list when they are still relevant to this report.",
      "- Avoid repeating recently taught concepts unless the report adds something new about them.",
      "- Ground each tip in widely established background knowledge; if something is contested or uncertain, say so.",
      "- Each tip must relate to this report's content, not generic trivia.",
    ].join("\n"),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      report: plainReportText(sections),
      already_known: knownConcepts(memory),
      asked_to_revisit: revisitConcepts(memory),
      recently_taught: memory.taught
        .filter((t) => t.status === "taught")
        .slice(0, 20)
        .map((t) => t.concept),
    }),
  });

  const tips: MentorTip[] = result.tips.slice(0, MAX_TIPS).map((t) => ({
    id: crypto.randomUUID(),
    concept: t.concept.trim(),
    tip: t.tip.trim(),
    more: null,
  }));

  return {
    tips,
    memory: mergeTaughtConcepts(memory, tips, new Date().toISOString()),
  };
}

/** "Share more" — a deeper follow-up on one tip. */
export async function expandMentorTip(
  llm: Llm,
  topic: Topic,
  level: MentorLevel,
  concept: string,
  priorTip: string,
): Promise<string> {
  const result = await llm.structured({
    tier: "search",
    schema: MentorMoreSchema,
    schemaName: "mentor_more",
    instructions: [
      "You are Mentor, a personal tutor. The user read your tip and asked to learn MORE about this concept.",
      LEVEL_GUIDANCE[level],
      "Go one level deeper than the original tip: background, mechanics, why it matters for the topic. Do not repeat the original tip. State uncertainty where it exists.",
    ].join("\n"),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      concept,
      original_tip: priorTip,
    }),
  });
  return result.more.trim();
}
