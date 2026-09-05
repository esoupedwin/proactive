import { z } from "zod";
import {
  MAX_PROFILES_PER_REPORT,
  MAX_TRACKED_PERSONALITIES,
  personalityBaselineInstructions,
  personalityProfilesInstructions,
  personalityUpdateInstructions,
} from "../../prompts";
import type {
  ExpertMemoryData,
  PersonalityProfile,
  PersonalityStance,
  ReportSections,
  Topic,
  TrackedPersonality,
} from "../../types";
import type { Llm } from "../llm";
import { plainReportText } from "./report-text";
import { fetchWikiImage, type WikiImageFetcher } from "./wiki-image";

// The roster/profile caps are quoted inside the instruction text, so they
// live beside it in lib/prompts.ts; re-exported for existing importers.
export { MAX_TRACKED_PERSONALITIES };

/**
 * Personality — studies and tracks the people behind a topic. Two modes:
 *
 * - "stance": on its first run it scans the web for the key players on a
 *   configured issue and records a baseline of who they are and where they
 *   stand. Every later run reads the new report and the raw extracts recorded
 *   since its last review, and updates each stance — marking who shifted, who
 *   held, and who newly entered the picture. The roster and each person's
 *   stance history live in expert memory.
 *
 * - "profiles": reads each report and profiles the people mentioned in it —
 *   who they are, their affiliations, and what they did in this report —
 *   fact-checked via web search. Remembers who it already profiled.
 */

/** Remember at most this many profiled names (profiles mode). */
const MAX_PROFILED_NAMES = 100;
/** Keep at most this many stance revisions per person. */
const MAX_STANCE_HISTORY = 20;

export const PersonalityBaselineSchema = z.object({
  players: z
    .array(
      z.object({
        name: z.string().describe("The person's full name as commonly written"),
        why_matters: z
          .string()
          .describe(
            "1-2 sentences: their role and why their position moves this issue (influence, formal power, faction)",
          ),
        stance: z
          .string()
          .describe(
            "1-2 sentences: their current position on the issue, grounded in what they have actually said or done",
          ),
      }),
    )
    .min(1)
    .max(MAX_TRACKED_PERSONALITIES)
    .describe(
      "The key players whose positions decide or signal this issue, most influential first",
    ),
});

export const PersonalityUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        name: z.string().describe("Exactly the roster name, or a new player's name"),
        why_matters: z
          .string()
          .describe("Refreshed 1-2 sentence role/influence note; keep the prior one when still accurate"),
        stance: z
          .string()
          .describe("Their current position after this report's evidence, 1-2 sentences"),
        trend: z
          .enum(["unchanged", "shifted", "new"])
          .describe(
            "'shifted' only when the evidence shows a real change of position; 'new' for a player not yet on the roster",
          ),
        change_note: z
          .string()
          .describe(
            "When shifted/new: what changed and the evidence for it, one sentence. Empty string when unchanged.",
          ),
      }),
    )
    .describe("One entry per tracked player, plus any genuinely new key player"),
});

export const PersonalityProfilesSchema = z.object({
  profiles: z
    .array(
      z.object({
        name: z.string().describe("The person's full name as commonly written"),
        who: z
          .string()
          .describe(
            "2-3 sentences: who they are — role, affiliation chain (party → coalition where relevant), background",
          ),
        relevance: z
          .string()
          .describe("1-2 sentences: what they said or did in THIS report and why it matters"),
      }),
    )
    .max(MAX_PROFILES_PER_REPORT)
    .describe(
      `0 to ${MAX_PROFILES_PER_REPORT} profiles of people central to this report; return none if every mentioned person is already profiled`,
    ),
});

/** One raw extract recorded since the last review (stance mode evidence). */
export interface PersonalityExtractSummary {
  source_type: string;
  title: string;
  published_at: string | null;
  gist: string;
  recorded_at: string;
}

/**
 * First stance-mode run: scan the web for the key players on the issue and
 * record the baseline roster.
 */
export async function runPersonalityBaseline(
  llm: Llm,
  topic: Topic,
  issue: string,
): Promise<{ players: Array<{ name: string; why_matters: string; stance: string }> }> {
  const result = await llm.structured({
    // Search tier: this is retrieval-and-read work — the web_search tool does
    // the heavy lifting, like the mentor's entity fact-checking.
    tier: "search",
    schema: PersonalityBaselineSchema,
    schemaName: "personality_baseline",
    useWebSearch: true,
    // Text in lib/prompts.ts, the app-wide prompt catalog.
    instructions: personalityBaselineInstructions(issue),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      issue,
    }),
  });

  return {
    players: result.players.map((p) => ({
      name: p.name.trim(),
      why_matters: p.why_matters.trim(),
      stance: p.stance.trim(),
    })),
  };
}

/**
 * Later stance-mode runs: test each tracked stance against the new report and
 * the extracts recorded since the last review.
 */
export async function runPersonalityUpdate(
  llm: Llm,
  topic: Topic,
  sections: ReportSections,
  issue: string,
  roster: TrackedPersonality[],
  newExtracts: PersonalityExtractSummary[],
): Promise<{
  updates: Array<{
    name: string;
    why_matters: string;
    stance: string;
    trend: "unchanged" | "shifted" | "new";
    change_note: string;
  }>;
}> {
  const result = await llm.structured({
    // Report tier: judging whether evidence really moves a person's position
    // is interpretation, not retrieval — misreading a shift is the failure
    // mode that matters.
    tier: "judgment",
    schema: PersonalityUpdateSchema,
    schemaName: "personality_update",
    // Text in lib/prompts.ts, the app-wide prompt catalog.
    instructions: personalityUpdateInstructions(issue),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      issue,
      roster: roster.map((p) => ({
        name: p.name,
        why_matters: p.why_matters,
        stance: p.stance,
        stance_history: p.history,
      })),
      report: plainReportText(sections),
      new_extracts: newExtracts,
    }),
  });

  return {
    updates: result.updates.map((u) => ({
      name: u.name.trim(),
      why_matters: u.why_matters.trim(),
      stance: u.stance.trim(),
      trend: u.trend,
      change_note: u.change_note.trim(),
    })),
  };
}

/** Profiles mode: profile the people mentioned in this report. */
export async function runPersonalityProfiles(
  llm: Llm,
  topic: Topic,
  sections: ReportSections,
  alreadyProfiled: string[],
): Promise<{ profiles: Array<{ name: string; who: string; relevance: string }> }> {
  const result = await llm.structured({
    // Search tier + web search: identity fact-checking, like mentor entities.
    tier: "search",
    schema: PersonalityProfilesSchema,
    schemaName: "personality_profiles",
    useWebSearch: true,
    // Text in lib/prompts.ts, the app-wide prompt catalog.
    instructions: personalityProfilesInstructions(),
    input: JSON.stringify({
      topic: { title: topic.title, goal: topic.description },
      report: plainReportText(sections),
      already_profiled: alreadyProfiled,
    }),
  });

  return {
    profiles: result.profiles.map((p) => ({
      name: p.name.trim(),
      who: p.who.trim(),
      relevance: p.relevance.trim(),
    })),
  };
}

/** Builds the baseline roster from a scan's players (pure, unit-testable). */
export function baselineRoster(
  players: Array<{ name: string; why_matters: string; stance: string }>,
  now: string,
): TrackedPersonality[] {
  return players.slice(0, MAX_TRACKED_PERSONALITIES).map((p) => ({
    name: p.name,
    why_matters: p.why_matters,
    stance: p.stance,
    history: [{ at: now, stance: p.stance, note: "baseline" }],
    updated_at: now,
  }));
}

/**
 * Folds an update run into the roster (pure, unit-testable). Shifted and new
 * players append to their stance history; unknown 'shifted' names are treated
 * as new. The roster order is preserved; new players append at the end.
 */
export function mergeStanceUpdates(
  roster: TrackedPersonality[],
  updates: Array<{
    name: string;
    why_matters: string;
    stance: string;
    trend: "unchanged" | "shifted" | "new";
    change_note: string;
  }>,
  now: string,
): TrackedPersonality[] {
  const byKey = new Map(roster.map((p) => [p.name.toLowerCase(), { ...p }]));
  for (const u of updates) {
    const key = u.name.toLowerCase();
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      existing.why_matters = u.why_matters || existing.why_matters;
      if (u.trend === "shifted" && u.stance !== existing.stance) {
        existing.history = [
          ...existing.history,
          { at: now, stance: u.stance, note: u.change_note || null },
        ].slice(-MAX_STANCE_HISTORY);
        existing.updated_at = now;
      }
      existing.stance = u.stance || existing.stance;
    } else if (byKey.size < MAX_TRACKED_PERSONALITIES) {
      byKey.set(key, {
        name: u.name,
        why_matters: u.why_matters,
        stance: u.stance,
        history: [{ at: now, stance: u.stance, note: u.change_note || null }],
        updated_at: now,
      });
    }
  }
  return [...byKey.values()];
}

/** The per-report stance view rendered under the briefing (pure). */
export function stancesForOutput(
  roster: TrackedPersonality[],
  updates: Array<{ name: string; trend: "unchanged" | "shifted" | "new"; change_note: string }> | null,
): PersonalityStance[] {
  const trendByKey = new Map(
    (updates ?? []).map((u) => [u.name.toLowerCase(), u]),
  );
  return roster.map((p) => {
    const u = trendByKey.get(p.name.toLowerCase());
    const trend = updates === null ? "baseline" : (u?.trend ?? "unchanged");
    return {
      name: p.name,
      why_matters: p.why_matters,
      stance: p.stance,
      trend,
      change_note:
        trend === "shifted" || trend === "new" ? u?.change_note || null : null,
      image_url: p.image_url ?? null,
      image_page_url: p.image_page_url ?? null,
    };
  });
}

/** Folds newly profiled names into memory (pure); most recent last. */
export function mergeProfiledNames(
  memory: ExpertMemoryData,
  profiles: Array<{ name: string }>,
): string[] {
  const seen = new Set((memory.profiled ?? []).map((n) => n.toLowerCase()));
  const merged = [...(memory.profiled ?? [])];
  for (const p of profiles) {
    const name = p.name.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    merged.push(name);
  }
  return merged.slice(-MAX_PROFILED_NAMES);
}

/**
 * Attaches Wikipedia portraits to people missing one — best-effort and in
 * parallel; a miss just leaves the entry without an image.
 */
export async function attachWikiImages<
  T extends { name: string; image_url?: string | null; image_page_url?: string | null },
>(people: T[], imageFetcher: WikiImageFetcher = fetchWikiImage): Promise<T[]> {
  const images = await Promise.all(
    people.map((p) =>
      p.image_url ? null : imageFetcher(p.name).catch(() => null),
    ),
  );
  return people.map((p, i) => {
    const image = images[i];
    return image
      ? { ...p, image_url: image.image_url, image_page_url: image.page_url }
      : p;
  });
}

/** Builds profile outputs with images already attached (pure apart from images). */
export function profilesForOutput(
  profiles: Array<{ name: string; who: string; relevance: string }>,
): PersonalityProfile[] {
  return profiles.map((p) => ({
    name: p.name,
    who: p.who,
    relevance: p.relevance,
    image_url: null,
    image_page_url: null,
  }));
}
