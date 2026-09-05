import { NextResponse } from "next/server";
import { createExaSearcher } from "@/lib/agents/exa";
import { generateNewsQuery } from "@/lib/ai/news-query";
import { flushLedger } from "@/lib/ai/ledger";
import { createOpenAiLlm } from "@/lib/ai/openai";
import { createUsageCollector } from "@/lib/ai/usage";
import {
  configuredNewsProvider,
  exaToNewsResults,
  filterNewsByAge,
  markNewResults,
  searchNews,
  type NewsResult,
} from "@/lib/news-search";
import { freshnessDays } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { frameFactorNames, type Topic } from "@/lib/types";

export const maxDuration = 60;

const MAX_RESULTS = 10;

/**
 * GET /api/topics/[topicId]/related-news — direct news search using the
 * topic's stored query: Exa semantic search when EXA_API_KEY is set
 * (Brave/SerpApi as fallback), with each result flagged as new or already
 * collected in this topic's extract store.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await context.params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.EXA_API_KEY && !configuredNewsProvider()) {
    return NextResponse.json(
      {
        error:
          "No news search provider configured. Set EXA_API_KEY (or BRAVE_SEARCH_API_KEY / SERPAPI_API_KEY).",
      },
      { status: 501 },
    );
  }

  const { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("id", topicId)
    .maybeSingle<Topic>();
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  // Stored at topic setup; regenerate lazily for topics that predate the
  // feature (or where generation failed at save time).
  let query = topic.news_query?.trim() || null;
  if (!query) {
    try {
      const usage = createUsageCollector();
      query = await generateNewsQuery(createOpenAiLlm(usage), {
        title: topic.title,
        description: topic.description,
        interest_areas: frameFactorNames(topic.interest_frame),
      });
      await supabase
        .from("topics")
        .update({ news_query: query })
        .eq("id", topic.id);
      await flushLedger(supabase, usage, { userId: user.id, topicId: topic.id });
    } catch (err) {
      console.error("lazy news query generation failed", err);
      return NextResponse.json(
        { error: "Could not formulate a search query for this topic." },
        { status: 500 },
      );
    }
  }

  try {
    // Same freshness window as report generation: derived from frequency.
    const windowDays = freshnessDays(topic.frequency);
    let provider: string;
    let results: NewsResult[];
    if (process.env.EXA_API_KEY) {
      provider = "exa";
      results = exaToNewsResults(
        await createExaSearcher().search(query, {
          daysBack: windowDays,
          category: "news",
          numResults: MAX_RESULTS,
        }),
      );
    } else {
      ({ provider, results } = await searchNews(query, windowDays));
    }
    const inWindow = filterNewsByAge(results, windowDays).slice(0, MAX_RESULTS);

    const { data: urlRows } = await supabase
      .from("extracts")
      .select("url")
      .eq("topic_id", topic.id)
      .limit(1000);

    const marked = markNewResults(
      inWindow,
      (urlRows ?? []).map((row) => row.url as string),
    );

    return NextResponse.json({
      ok: true,
      query,
      provider,
      window_days: windowDays,
      new_count: marked.filter((r) => r.is_new).length,
      results: marked,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
