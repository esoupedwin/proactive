import OpenAI from "openai";
import type { Response } from "openai/resources/responses/responses";
import type { SourceLink } from "@/lib/types";

const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set — see SETUP.md");
  }
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/** Pull url_citation annotations out of a Responses API result, deduped by URL. */
function extractCitations(response: Response): SourceLink[] {
  const links = new Map<string, SourceLink>();
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      for (const annotation of part.annotations ?? []) {
        if (annotation.type === "url_citation" && annotation.url) {
          links.set(annotation.url, {
            title: annotation.title || annotation.url,
            url: annotation.url,
          });
        }
      }
    }
  }
  return [...links.values()];
}

/**
 * Run a web-search-backed prompt and return the model's short update plus
 * the cited source links. `allowedDomains` scopes the search (e.g. medium.com).
 */
export async function webSearchUpdate(
  prompt: string,
  allowedDomains?: string[]
): Promise<{ content: string; sources: SourceLink[] }> {
  const response = await getClient().responses.create({
    model: MODEL,
    tools: [
      {
        type: "web_search",
        search_context_size: "medium",
        ...(allowedDomains ? { filters: { allowed_domains: allowedDomains } } : {}),
      },
    ],
    input: prompt,
  });

  return {
    content: response.output_text.trim(),
    sources: extractCitations(response),
  };
}

/**
 * After an update is fetched, extract up to 3 NEW key points worth remembering
 * long-term, given what's already in memory. Returns [] when nothing is new.
 */
export async function extractKeyPoints(opts: {
  interestName: string;
  intent: string | null;
  source: string;
  updateContent: string;
  existing: string[];
}): Promise<string[]> {
  const existingBlock = opts.existing.length
    ? opts.existing.map((m) => `- ${m}`).join("\n")
    : "(empty)";

  const prompt = `You maintain the user's long-term memory about the topic "${opts.interestName}".
${opts.intent ? `The user's goal: ${opts.intent}` : ""}

Existing memory:
${existingBlock}

A fresh update was just fetched from ${opts.source}:
---
${opts.updateContent}
---

Extract at most 3 NEW key points worth remembering long-term: durable facts, milestones, or shifts in consensus — not transient details. Each point must be a single self-contained sentence of at most 25 words. Do NOT repeat or rephrase anything already in existing memory.

Respond with ONLY a JSON array of strings, e.g. ["point one", "point two"]. If nothing is worth adding, respond with [].`;

  const response = await getClient().responses.create({
    model: MODEL,
    input: prompt,
  });

  const text = response.output_text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .slice(0, 3);
  } catch {
    return [];
  }
}

/** Plain completion (no tools) — used to synthesize pre-fetched content (e.g. Reddit posts). */
export async function summarize(prompt: string): Promise<string> {
  const response = await getClient().responses.create({
    model: MODEL,
    input: prompt,
  });
  return response.output_text.trim();
}
