import { z } from "zod";
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
 */

const MAX_TIPS = 3;
const MAX_TAUGHT_CONCEPTS = 100;

const FOCUS_GUIDANCE: Record<MentorFocus, string> = {
  concepts:
    "Pick the concepts, entities, acronyms, or relationships the report ASSUMES but a reader at this level may not know (e.g. 'what is JS-SEZ', 'what is the relationship between Anwar Ibrahim and Ahmad Zahid Hamidi').",
  entities: [
    "Focus on the PEOPLE and ORGANISATIONS mentioned in the report. Each tip profiles exactly ONE entity — the 'concept' field is the entity's name.",
    "Structure every tip in this order:",
    "1. Identity and affiliation chain: who/what the entity is, with its full position in the structure — e.g. a person is 'a member of party X, a component party of coalition Y, where they serve as [role]'; an organisation gets its nature, full name/abbreviation, and (for coalitions) its member parties or key leaders.",
    "2. RELATIONSHIPS to other entities mentioned in the report, where applicable.",
    "3. What the entity did or why it matters in THIS report.",
    "",
    "Style examples (match this shape and density):",
    "- 'Mohd Hasbie Muda is a member of the National Trust Party (AMANAH), a component party of the Pakatan Harapan (PH) coalition, where he has served as AMANAH Youth Chief. He is blaming a DAP leader's reaction to Najib Razak's legal setback for worsening PH–BN relations.'",
    "- 'Najib Razak is a Malaysian politician who served as the sixth prime minister of Malaysia from 2009 to 2018. He is currently serving his sentence in Kajang Prison.'",
    "- 'Barisan Nasional (BN; English: National Front) is a political coalition in Malaysia. Its member parties are UMNO, MCA, MIC, PBRS and PPP.'",
    "",
    "Use the web search tool to FACT-CHECK names, roles, affiliations, and relationships before asserting them, and to supplement the report with verified, current background — roles and alliances change. If something cannot be verified, say so explicitly rather than guessing.",
  ].join("\n"),
};

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
    instructions: [
      "You are Mentor, a personal tutor embedded in a research briefing app. Your goal is to steadily improve the user's understanding of their topic.",
      LEVEL_GUIDANCE[level],
      "",
      "Read the report.",
      FOCUS_GUIDANCE[focus],
      focus === "entities"
        ? `Write at most ${MAX_TIPS} entity profiles, choosing the entities most central to this report. Fewer is fine; return none if every mentioned entity is already known.`
        : `Write at most ${MAX_TIPS} 'did you know'-style tips. Fewer is fine; return none if nothing needs explaining.`,
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
    instructions: [
      "You are Mentor, a personal tutor. The user read your tip and asked to learn MORE about this concept.",
      LEVEL_GUIDANCE[level],
      "Go one level deeper than the original tip: background, mechanics, why it matters for the topic. Do not repeat the original tip. State uncertainty where it exists.",
      ...(focus === "entities"
        ? [
            "Use the web search tool to verify roles, affiliations, and relationships before asserting them; flag anything you could not verify.",
          ]
        : []),
    ].join("\n"),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      concept,
      original_tip: priorTip,
    }),
  });
  return result.more.trim();
}
