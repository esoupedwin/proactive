import { summarize, webSearchUpdate } from "@/lib/openai";
import type { Interest, SourceLink } from "@/lib/types";
import {
  intentLine,
  memoryBlock,
  noveltyBlock,
  STYLE_RULES,
  todayString,
  type FetchContext,
  type FetchResult,
} from "./shared";

interface RedditPost {
  title: string;
  subreddit: string;
  score: number;
  numComments: number;
  selftext: string;
  permalink: string;
}

interface RedditListingChild {
  data: {
    title?: string;
    subreddit?: string;
    score?: number;
    num_comments?: number;
    selftext?: string;
    permalink?: string;
    stickied?: boolean;
  };
}

async function searchReddit(query: string): Promise<RedditPost[]> {
  const url =
    `https://www.reddit.com/search.json?` +
    new URLSearchParams({
      q: query,
      sort: "relevance",
      t: "week",
      limit: "12",
    });

  const res = await fetch(url, {
    headers: {
      // Reddit rejects requests without a descriptive User-Agent.
      "User-Agent": "web:proactive-app:v1.0 (interest tracker)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Reddit search failed (HTTP ${res.status})`);
  }

  const json = await res.json();
  const children: RedditListingChild[] = json?.data?.children ?? [];

  return children
    .filter((c) => c.data?.title && !c.data.stickied)
    .map((c) => ({
      title: c.data.title!,
      subreddit: c.data.subreddit ?? "",
      score: c.data.score ?? 0,
      numComments: c.data.num_comments ?? 0,
      // Cap selftext so a handful of long posts doesn't blow up the prompt.
      selftext: (c.data.selftext ?? "").slice(0, 1500),
      permalink: c.data.permalink ?? "",
    }));
}

/**
 * Reddit blocks its unauthenticated JSON API from many networks (HTTP 403).
 * When that happens, fall back to OpenAI web search scoped to reddit.com —
 * same pipeline as the Medium tab.
 */
async function fetchRedditViaWebSearch(
  interest: Interest,
  ctx: FetchContext
): Promise<FetchResult> {
  // (status is reported by the caller, which knows why we fell back)
  const prompt = `Today is ${todayString()}. Search reddit.com for recent discussions (roughly the past week) about: "${interest.name}".
${intentLine(interest)}
${memoryBlock(ctx.memories)}
Synthesize what Reddit communities are currently discussing and feeling about this topic — dominant opinions, debates, and notable takes. Refer to communities as r/name. ${STYLE_RULES}
${noveltyBlock(ctx.previous)}`;

  return webSearchUpdate(prompt, ["reddit.com"]);
}

export async function fetchReddit(
  interest: Interest,
  ctx: FetchContext = {}
): Promise<FetchResult> {
  ctx.onStatus?.("Querying the Reddit API…");

  let posts: RedditPost[];
  try {
    posts = await searchReddit(interest.name);
  } catch {
    ctx.onStatus?.("Reddit API blocked — falling back to OpenAI web search of reddit.com…");
    return fetchRedditViaWebSearch(interest, ctx);
  }

  if (posts.length === 0) {
    ctx.onStatus?.("No posts from the Reddit API — falling back to OpenAI web search of reddit.com…");
    return fetchRedditViaWebSearch(interest, ctx);
  }

  ctx.onStatus?.(`Found ${posts.length} Reddit posts — summarizing with OpenAI…`);

  const postsBlock = posts
    .map(
      (p, i) =>
        `${i + 1}. [r/${p.subreddit}] "${p.title}" (${p.score} upvotes, ${p.numComments} comments)` +
        (p.selftext ? `\n   ${p.selftext.replaceAll("\n", " ")}` : "")
    )
    .join("\n");

  const prompt = `Today is ${todayString()}. Below are Reddit posts from the past week matching the topic "${interest.name}".
${intentLine(interest)}
${memoryBlock(ctx.memories)}

Synthesize what Reddit is currently discussing and feeling about this topic — dominant opinions, debates, and notable takes. Refer to communities as r/name. ${STYLE_RULES}
${noveltyBlock(ctx.previous)}

Posts:
${postsBlock}`;

  const content = await summarize(prompt);

  const sources: SourceLink[] = posts
    .slice(0, 6)
    .filter((p) => p.permalink)
    .map((p) => ({
      title: `r/${p.subreddit}: ${p.title}`,
      url: `https://www.reddit.com${p.permalink}`,
    }));

  return { content, sources };
}
