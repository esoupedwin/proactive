import { NextResponse } from "next/server";
import { generateNewsQuery } from "@/lib/ai/news-query";
import { openAiLlm } from "@/lib/ai/openai";
import {
  configuredNewsProvider,
  filterNewsByAge,
  markNewResults,
  searchNews,
} from "@/lib/news-search";
import { freshnessDays } from "@/lib/reports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Topic } from "@/lib/types";

export const maxDuration = 60;

/**
 * GET /api/topics/[topicId]/related-news — direct news search (Brave/SerpApi)
 * using the topic's stored query, with each result flagged as new or already
 * collected in this topic's sources.
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

  if (!configuredNewsProvider()) {
    return NextResponse.json(
      {
        error:
          "No news search provider configured. Set BRAVE_SEARCH_API_KEY or SERPAPI_API_KEY.",
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
      query = await generateNewsQuery(openAiLlm, topic);
      await supabase
        .from("topics")
        .update({ news_query: query })
        .eq("id", topic.id);
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
    const { provider, results } = await searchNews(query, windowDays);
    const inWindow = filterNewsByAge(results, windowDays).slice(0, 10);

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
