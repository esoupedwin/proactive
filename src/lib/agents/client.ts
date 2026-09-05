import OpenAI from "openai";
import {
  OpenAIProvider,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
  type ModelProvider,
} from "@openai/agents";
import { resolveTierConfig, type Platform } from "../ai/tiers";

/**
 * Shared OpenAI client + Agents SDK wiring for the two backend agents
 * (Info Tracker and Reporter). Which model each agent runs — and, for the
 * Reporter, which platform — comes from the tier config (src/lib/ai/tiers.ts).
 */

let client: OpenAI | null = null;

export function getSharedOpenAI(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

let sdkReady = false;

/**
 * One-time Agents SDK setup: use our client, the Responses API, and keep
 * tracing local (we persist our own trace to reports.trace).
 */
export function initAgentsSdk(): void {
  if (sdkReady) return;
  setDefaultOpenAIClient(getSharedOpenAI());
  setOpenAIAPI("responses");
  setTracingDisabled(true);
  sdkReady = true;
}

/**
 * Model provider for real runs (tests inject a fake one instead).
 *
 * openai → the Responses API (hosted tools, prompt caching). openrouter →
 * OpenRouter's OpenAI-compatible chat-completions endpoint: function tools
 * and structured outputs work (model permitting), hosted tools do not — the
 * tier config already keeps the search tier off this path.
 */
export function createModelProvider(platform: Platform): ModelProvider {
  if (platform === "openrouter") {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }
    return new OpenAIProvider({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      useResponses: false,
    });
  }
  return new OpenAIProvider({
    openAIClient: getSharedOpenAI(),
    useResponses: true,
  });
}

/** Info Tracker — search tier (always OpenAI: hosted web_search). */
export async function trackerModel(): Promise<string> {
  return (await resolveTierConfig("search")).model;
}

/** Reporter — judgment tier: platform + model. */
export function reporterTier(): Promise<{ platform: Platform; model: string }> {
  return resolveTierConfig("judgment");
}

export async function embeddingModel(): Promise<string> {
  return (await resolveTierConfig("embedding")).model;
}
