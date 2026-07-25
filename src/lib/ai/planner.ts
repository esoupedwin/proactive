import type { Topic } from "../types";
import type { Llm } from "./llm";
import {
  FollowupQueriesSchema,
  SearchPlanSchema,
  type FoundSource,
  type SearchPlan,
} from "./schemas";

/**
 * Topic planner — converts the user's topic description and interest areas
 * into concrete search queries for each source channel.
 */
export async function planSearches(llm: Llm, topic: Topic): Promise<SearchPlan> {
  const today = new Date().toISOString().slice(0, 10);

  return llm.structured({
    tier: "search",
    schema: SearchPlanSchema,
    schemaName: "search_plan",
    instructions: [
      "You are the research planner for a personal intelligence briefing product.",
      "Design short, specific web search queries that will surface RECENT developments (last ~7 days when possible).",
      "News queries target mainstream/trade news. Reddit queries target community discussion. Medium queries target practitioner writing.",
      "Do not include site: operators — the channel is handled separately. Keep each query under 10 words.",
    ].join("\n"),
    input: [
      `Today's date: ${today}`,
      `Topic: ${topic.title}`,
      `What the user wants to know: ${topic.description}`,
      `Key interest areas: ${topic.interest_areas.join("; ") || "(none specified)"}`,
    ].join("\n"),
  });
}

const FOLLOWUP_GUIDANCE = {
  reddit:
    "Write Reddit search queries targeting COMMUNITY REACTION to these specific developments — how people are responding, debating, or comparing.",
  medium:
    "Write Medium search queries targeting PRACTITIONER ANALYSIS of these specific developments — hands-on takes, lessons, and interpretation.",
} as const;

/**
 * Cascade step: given what the news search actually found, write targeted
 * follow-up queries for Reddit or Medium. Falls back to the initial plan's
 * queries when there are no news findings or the call fails.
 */
export async function planFollowupQueries(
  llm: Llm,
  topic: Topic,
  channel: "reddit" | "medium",
  newsFindings: FoundSource[],
  fallback: string[],
): Promise<string[]> {
  if (newsFindings.length === 0) return fallback;

  try {
    const result = await llm.structured({
      tier: "search",
      schema: FollowupQueriesSchema,
      schemaName: "followup_queries",
      instructions: [
        "You are the research planner for a personal intelligence briefing product.",
        FOLLOWUP_GUIDANCE[channel],
        "Base queries on the concrete developments below (names, products, events), not on the topic in general.",
        "Do not include site: operators. Keep each query under 10 words. Return 1-3 queries.",
      ].join("\n"),
      input: JSON.stringify(
        {
          topic: topic.title,
          user_goal: topic.description,
          news_findings: newsFindings.slice(0, 6).map((s) => ({
            title: s.title,
            snippet: s.snippet,
          })),
        },
        null,
        2,
      ),
    });

    // Keep one broad query from the original plan so we don't lose coverage
    // of the topic beyond today's news.
    const merged = [...result.queries.slice(0, 3), ...fallback.slice(0, 1)];
    const unique = [...new Set(merged.filter((q) => q.trim().length > 0))];
    return unique.length > 0 ? unique : fallback;
  } catch (err) {
    console.error(`follow-up planning failed for ${channel}`, err);
    return fallback;
  }
}
