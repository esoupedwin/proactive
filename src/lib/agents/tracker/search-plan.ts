import type { InterestFactor, Topic } from "../../types";

/**
 * The Tracker's web-search plan: one query per key factor, plus one
 * exploratory query for developments outside the frame.
 *
 * The hosted web_search tool is model-invoked — code cannot run the searches
 * itself — so coverage is enforced the only way it can be: the plan is built
 * here, deterministically, and the prompt requires every entry to run. Left
 * to "plan 2-4 angles" the model covered whichever factors it found most
 * salient, and quieter factors went unsearched for runs at a time.
 */

export interface PlannedSearch {
  /** The factor this query covers; null for the exploratory search. */
  factor: string | null;
  query: string;
}

/** Stop words that add nothing to a keyword query. */
const STOP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "do", "does", "for",
  "from", "has", "have", "how", "in", "is", "it", "its", "of", "on", "or",
  "the", "to", "what", "which", "will", "with", "would",
]);

/** Distinct content words of a phrase, in order, lower-cased. */
function terms(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9'’-]+/)) {
    const word = raw.replace(/^['’-]+|['’-]+$/g, "");
    // Single letters are abbreviation debris ("e.g." → e, g), never terms.
    if (word.length < 2 || STOP.has(word) || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

/** "August 2026" — a recency cue search engines honour. */
function monthYear(now: Date): string {
  return now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Cap so a factor with many indicators does not swamp the topic terms. */
const MAX_INDICATORS_PER_QUERY = 4;
/** A query this long is a sentence, not a search. */
const MAX_QUERY_TERMS = 14;

function factorQuery(topic: Topic, factor: InterestFactor, now: Date): string {
  // Subject first so every query is anchored to the topic, then the
  // factor's own vocabulary: its name, then the evidence it watches for.
  // The key question is left out — it is framed for a reader, and its
  // words ("does", "gain more by") are noise to a search engine.
  const subject = terms(topic.title);
  const name = terms(factor.name).filter((t) => !subject.includes(t));
  const indicators = factor.indicators
    .slice(0, MAX_INDICATORS_PER_QUERY)
    .flatMap(terms)
    .filter((t) => !subject.includes(t) && !name.includes(t));
  let own = [...name, ...indicators];
  // A factor whose name the title already covers, with nothing to watch for,
  // would search for the bare topic. Fall back to the question's terms so
  // the query still has something of the factor in it.
  if (own.length === 0) {
    own = terms(factor.key_question)
      .filter((t) => !subject.includes(t))
      .slice(0, MAX_INDICATORS_PER_QUERY);
  }
  const words = [...subject, ...own].slice(0, MAX_QUERY_TERMS);
  return `${words.join(" ")} ${monthYear(now)}`;
}

function exploratoryQuery(topic: Topic, now: Date): string {
  return `${terms(topic.title).join(" ")} latest news ${monthYear(now)}`;
}

export function buildSearchPlan(topic: Topic, now: Date): PlannedSearch[] {
  const factors = topic.interest_frame.filter((f) => f.name.trim() !== "");
  return [
    ...factors.map((f) => ({
      factor: f.name,
      query: factorQuery(topic, f, now),
    })),
    { factor: null, query: exploratoryQuery(topic, now) },
  ];
}

/** Prompt lines: the plan, and the requirement to run all of it. */
export function renderSearchPlan(plan: PlannedSearch[]): string[] {
  return [
    "Web-search plan — run EVERY search below, one web_search call each. Use the query as written; you may tighten wording for the engine but keep the factor's terms so its coverage is real:",
    ...plan.map((p) =>
      p.factor
        ? `- [${p.factor}] ${p.query}`
        : `- [exploratory — developments outside the frame] ${p.query}`,
    ),
  ];
}
