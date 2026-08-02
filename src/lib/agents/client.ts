import OpenAI from "openai";
import {
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";

/**
 * Shared OpenAI client + Agents SDK wiring for the two backend agents
 * (Info Tracker and Reporter).
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

/** Info Tracker model — cheap search tier. */
export function trackerModel(): string {
  return process.env.OPENAI_SEARCH_MODEL ?? "gpt-5-mini";
}

/** Reporter model — the editorial tier. */
export function reporterModel(): string {
  return process.env.OPENAI_REPORT_MODEL ?? "gpt-5";
}

export function embeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
}
