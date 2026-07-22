import type { Interest, SourceLink } from "@/lib/types";

export interface FetchResult {
  content: string;
  sources: SourceLink[];
}

/** Reports a human-readable progress message for the current fetch stage. */
export type StatusReporter = (message: string) => void;

export interface FetchContext {
  onStatus?: StatusReporter;
  /** Long-term memory: key points already known about this interest. */
  memories?: string[];
  /** The currently cached update for this interest+source, if any. */
  previous?: string;
}

export type Fetcher = (
  interest: Interest,
  ctx?: FetchContext
) => Promise<FetchResult>;

/** Sentinel the model returns when a re-fetch finds nothing substantially new. */
export const NO_NEW_UPDATES = "NO_NEW_UPDATES";

export function isNoNewUpdates(content: string): boolean {
  return content.trim().toUpperCase().startsWith(NO_NEW_UPDATES);
}

/** Asks the model to signal explicitly when nothing changed since the previous update. */
export function noveltyBlock(previous?: string): string {
  if (!previous) return "";
  return `The user's current cached update reads:
---
${previous}
---
IMPORTANT: compare your findings against the cached update and the long-term memory above. If there is nothing substantially new or changed, respond with exactly "${NO_NEW_UPDATES}" and nothing else. Only write an update if it contains genuinely new information — and then focus it on what changed.`;
}

/** Injects long-term memory into a fetch prompt so the model focuses on what's new. */
export function memoryBlock(memories: string[] = []): string {
  if (memories.length === 0) return "";
  return `You already know the following from previous fetches (long-term memory). Do NOT repeat these — focus on what is new or has changed since:
${memories.map((m) => `- ${m}`).join("\n")}`;
}

export function todayString(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function intentLine(interest: Interest): string {
  return interest.intent
    ? `What the user wants to know: ${interest.intent}`
    : "";
}

export const STYLE_RULES = `Write a very short update: 2-3 short paragraphs maximum, plain prose (no headings, no bullet lists).
Bold the key names, products, and events with **markdown bold**.
Be concrete and current — dates, numbers, and who said what. Skip generic background the reader likely knows.
The goal is to equip the reader to hold an informed conversation about this topic today.`;
