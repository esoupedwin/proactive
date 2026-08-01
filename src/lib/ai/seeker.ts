import { freshnessDays } from "../reports";
import type { SourceType, Topic } from "../types";
import { freshnessCutoff } from "./freshness";
import type { Llm } from "./llm";
import { planFollowupQueries } from "./planner";
import { SeekResultSchema, type FoundSource, type SearchPlan } from "./schemas";

const CHANNEL_GUIDANCE: Record<SourceType, string> = {
  news: "Search reputable news and trade publications. Exclude reddit.com and medium.com results.",
  reddit:
    "Search Reddit discussions (site:reddit.com). Find threads with substantive community reaction, not empty link posts. Note the subreddit as the publisher.",
  medium:
    "Search Medium articles (site:medium.com). Find practitioner analysis and hands-on writing. Note the author or publication as the publisher.",
};

export interface SeekOutput {
  source_type: SourceType;
  sources: FoundSource[];
}

/** More queries than this per channel tempts the model into extra searches. */
const MAX_QUERIES_PER_CHANNEL = 2;

/**
 * Information seeker — runs a web search per channel and returns the sources
 * found. News first, then Reddit, then Medium (sequential by design so the
 * later, opinion-heavy channels can be interpreted against reported news).
 */
export async function seekChannel(
  llm: Llm,
  topic: Topic,
  channel: SourceType,
  queries: string[],
): Promise<SeekOutput> {
  const today = new Date().toISOString().slice(0, 10);
  const windowDays = freshnessDays(topic.frequency);
  const cutoff = freshnessCutoff(topic.frequency).toISOString().slice(0, 10);

  const result = await llm.structured({
    tier: "search",
    schema: SeekResultSchema,
    schemaName: "seek_result",
    useWebSearch: true,
    instructions: [
      "You are the information seeker for a personal research companion.",
      CHANNEL_GUIDANCE[channel],
      `FRESHNESS: this topic uses a ${windowDays}-day window. Only include sources published on or after ${cutoff}; discard anything older. If a source's publication date is unknown, include it only if it clearly covers current developments.`,
      // Each web_search call is billed separately and pulls the fetched pages
      // in as input tokens, so one well-formed search per channel.
      "Make AT MOST ONE web search call. If several queries are supplied, combine them into a single well-formed search that covers them.",
      "Return up to 6 distinct, genuinely relevant sources from that search.",
      "Only include sources you actually found via search. Never invent URLs, titles, or dates.",
      "Snippets must reflect what the source actually says.",
    ].join("\n"),
    input: [
      `Today's date: ${today}`,
      `Topic: ${topic.title}`,
      `User goal: ${topic.description}`,
      `Interest areas: ${topic.interest_areas.join("; ")}`,
      `Queries to cover in one search: ${queries.slice(0, MAX_QUERIES_PER_CHANNEL).map((q) => `"${q}"`).join(", ")}`,
    ].join("\n"),
  });

  return { source_type: channel, sources: result.sources };
}

async function safeSeek(
  llm: Llm,
  topic: Topic,
  channel: SourceType,
  queries: string[],
): Promise<SeekOutput> {
  try {
    return await seekChannel(llm, topic, channel, queries);
  } catch (err) {
    // A single failing channel should not sink the whole update.
    console.error(`seek failed for channel ${channel}`, err);
    return { source_type: channel, sources: [] };
  }
}

/**
 * Runs the search cascade: news first, then Reddit and Medium with queries
 * re-planned around what the news search actually found — so the community
 * and practitioner channels track today's concrete developments, not just
 * the generic topic. Falls back to the initial plan's queries when news
 * finds nothing or re-planning fails.
 */
export async function seekAll(
  llm: Llm,
  topic: Topic,
  plan: SearchPlan,
  onChannel?: (channel: SourceType) => void,
): Promise<SeekOutput[]> {
  const outputs: SeekOutput[] = [];

  // 1. News — reported developments.
  let newsFindings: FoundSource[] = [];
  if (plan.news_queries.length > 0) {
    onChannel?.("news");
    const news = await safeSeek(llm, topic, "news", plan.news_queries);
    newsFindings = news.sources;
    outputs.push(news);
  }

  // 2. Reddit — community reaction to what the news surfaced.
  if (plan.reddit_queries.length > 0 || newsFindings.length > 0) {
    onChannel?.("reddit");
    const queries = await planFollowupQueries(
      llm,
      topic,
      "reddit",
      newsFindings,
      plan.reddit_queries,
    );
    if (queries.length > 0) {
      outputs.push(await safeSeek(llm, topic, "reddit", queries));
    }
  }

  // 3. Medium — practitioner interpretation of the same developments.
  if (plan.medium_queries.length > 0 || newsFindings.length > 0) {
    onChannel?.("medium");
    const queries = await planFollowupQueries(
      llm,
      topic,
      "medium",
      newsFindings,
      plan.medium_queries,
    );
    if (queries.length > 0) {
      outputs.push(await safeSeek(llm, topic, "medium", queries));
    }
  }

  return outputs;
}
