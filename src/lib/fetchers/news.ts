import { webSearchUpdate } from "@/lib/openai";
import type { Interest } from "@/lib/types";
import {
  intentLine,
  memoryBlock,
  noveltyBlock,
  STYLE_RULES,
  todayString,
  type FetchContext,
  type FetchResult,
} from "./shared";

export async function fetchNews(
  interest: Interest,
  ctx: FetchContext = {}
): Promise<FetchResult> {
  ctx.onStatus?.("Searching news via OpenAI web search…");
  const prompt = `Today is ${todayString()}. Search the web for the latest news (roughly the past week) about: "${interest.name}".
${intentLine(interest)}
${memoryBlock(ctx.memories)}
Prefer reputable news outlets. ${STYLE_RULES}
${noveltyBlock(ctx.previous)}`;

  return webSearchUpdate(prompt);
}
