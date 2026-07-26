import type { KnowledgeFact, ReportSections } from "./types";

/**
 * Key-entity highlighting.
 *
 * New reports: the reporter marks topic-central entities inline with
 * **double asterisks** (capped by the sanitizer). Older reports have no
 * markers, so we fall back to matching the topic's key entities from
 * knowledge memory at render time.
 */

export interface TextSegment {
  text: string;
  bold: boolean;
}

const MARKER_RE = /\*\*([^*]+)\*\*/g;

/** Splits "a **b** c" into segments; unmarked text becomes one plain segment. */
export function parseMarkedText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKER_RE)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: text.slice(last, index), bold: false });
    segments.push({ text: match[1]!, bold: true });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false });
  return segments.length > 0 ? segments : [{ text, bold: false }];
}

/** True if any bullet or the takeaway carries **entity** markers. */
export function hasEntityMarkers(sections: ReportSections): boolean {
  const texts = [
    ...sections.latest_developments,
    ...sections.community_reaction,
    ...sections.practitioner_view,
    ...sections.what_changed,
  ].map((b) => b.text);
  texts.push(sections.cross_source_takeaway);
  return texts.some((t) => /\*\*[^*]+\*\*/.test(t));
}

/** Keeps the first `max` **markers** in a text and unwraps the rest. */
export function capEntityMarkers(text: string, max: number): string {
  let seen = 0;
  return text.replace(MARKER_RE, (_full, inner: string) => {
    seen += 1;
    return seen <= max ? `**${inner}**` : inner;
  });
}

/** Removes all **markers**, leaving plain text (for memory/storage reuse). */
export function stripEntityMarkers(text: string): string {
  return text.replace(MARKER_RE, "$1");
}

const CONFIDENCE_WEIGHT = { high: 3, medium: 2, low: 1 } as const;
const MIN_ENTITY_LENGTH = 3;

/**
 * Ranks the topic's key entities from knowledge memory:
 * frequency across facts weighted by fact confidence, top `max`.
 */
export function keyEntitiesFromMemory(
  facts: KnowledgeFact[],
  max = 8,
): string[] {
  const scores = new Map<string, { name: string; score: number }>();
  for (const fact of facts) {
    const weight = CONFIDENCE_WEIGHT[fact.confidence] ?? 1;
    for (const raw of fact.entities) {
      const name = raw.trim();
      if (name.length < MIN_ENTITY_LENGTH) continue;
      const key = name.toLowerCase();
      const entry = scores.get(key) ?? { name, score: 0 };
      entry.score += weight;
      scores.set(key, entry);
    }
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((e) => e.name);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Bolds occurrences of the given entities in plain text (fallback for
 * reports without inline markers). Case-insensitive, word-boundary,
 * longest-entity-first so "Claude Opus 5" wins over "Claude".
 */
export function highlightEntities(
  text: string,
  entities: string[],
): TextSegment[] {
  const usable = entities
    .map((e) => e.trim())
    .filter((e) => e.length >= MIN_ENTITY_LENGTH)
    .sort((a, b) => b.length - a.length);
  if (usable.length === 0) return [{ text, bold: false }];

  const pattern = new RegExp(
    `(?<![\\w])(${usable.map(escapeRegex).join("|")})(?![\\w])`,
    "gi",
  );

  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: text.slice(last, index), bold: false });
    segments.push({ text: match[0], bold: true });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false });
  return segments.length > 0 ? segments : [{ text, bold: false }];
}
