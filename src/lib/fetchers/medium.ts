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

export async function fetchMedium(
  interest: Interest,
  ctx: FetchContext = {}
): Promise<FetchResult> {
  ctx.onStatus?.("Searching medium.com via OpenAI web search…");
  const prompt = `Today is ${todayString()}. Search Medium for recent blog posts (past few weeks) about: "${interest.name}".
${intentLine(interest)}
${memoryBlock(ctx.memories)}
Summarize what Medium writers are saying — notable arguments, opinions, and emerging consensus or disagreement. ${STYLE_RULES}
${noveltyBlock(ctx.previous)}`;

  return webSearchUpdate(prompt, ["medium.com"]);
}
