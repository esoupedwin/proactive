import { z } from "zod";
import {
  MENTOR_MAX_TIPS as MAX_TIPS,
  mentorMoreInstructions,
  mentorTipsInstructions,
} from "../../prompts";
import type {
  MentorFocus,
  MentorLevel,
  MentorMemoryData,
  MentorTip,
  ReportSections,
  Topic,
} from "../../types";
import type { Llm } from "../llm";
import { plainReportText } from "./report-text";
import { fetchWikiImage, type WikiImageFetcher } from "./wiki-image";

/**
 * Mentor — the first "expert": reads a generated report and teaches the user
 * key concepts, entities, and relationships the report assumes ("did you
 * know" tips). It remembers what it taught and respects user feedback:
 * concepts marked "known" are never re-taught; "revisit" ones come back.
 *
 * Its instruction text lives in lib/prompts.ts, the app-wide prompt catalog.
 */

const MAX_TAUGHT_CONCEPTS = 100;

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

export async function runMentor(
  llm: Llm,
  topic: Topic,
  sections: ReportSections,
  level: MentorLevel,
  focus: MentorFocus,
  memory: MentorMemoryData,
  imageFetcher: WikiImageFetcher = fetchWikiImage,
): Promise<{ tips: MentorTip[]; memory: MentorMemoryData }> {
  const result = await llm.structured({
    tier: "search",
    schema: MentorTipsSchema,
    schemaName: "mentor_tips",
    // Entity teaching is fact-checked against the live web.
    useWebSearch: focus === "entities",
    instructions: mentorTipsInstructions(level, focus),
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

  let tips: MentorTip[] = result.tips.slice(0, MAX_TIPS).map((t) => ({
    id: crypto.randomUUID(),
    concept: t.concept.trim(),
    tip: t.tip.trim(),
    more: null,
  }));

  // Entity profiles get the entity's Wikipedia photo/logo — best-effort,
  // fetched in parallel; a miss just leaves the tip without an image.
  if (focus === "entities" && tips.length > 0) {
    const images = await Promise.all(
      tips.map((t) => imageFetcher(t.concept).catch(() => null)),
    );
    tips = tips.map((tip, i) => {
      const image = images[i];
      return image
        ? { ...tip, image_url: image.image_url, image_page_url: image.page_url }
        : tip;
    });
  }

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
  focus: MentorFocus,
  concept: string,
  priorTip: string,
): Promise<string> {
  const result = await llm.structured({
    tier: "search",
    schema: MentorMoreSchema,
    schemaName: "mentor_more",
    useWebSearch: focus === "entities",
    instructions: mentorMoreInstructions(level, focus),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      concept,
      original_tip: priorTip,
    }),
  });
  return result.more.trim();
}
