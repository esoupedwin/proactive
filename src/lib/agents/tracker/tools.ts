import type { Topic } from "../../types";
import type { ExaSearcher } from "../exa";
import type { CreateExtractInput, ExtractStore } from "../extract-store";
import type { ExaSearchParams } from "../schemas";

/**
 * Pure tool implementations for the Info Tracker — the unit-test surface.
 * Each returns a compact string for the model; wiring into the Agents SDK
 * (schemas, tracing) happens in agent.ts.
 */

export interface TrackerToolDeps {
  store: ExtractStore;
  exa: ExaSearcher;
  topic: Topic;
}

export async function exaSearch(
  deps: TrackerToolDeps,
  params: ExaSearchParams,
): Promise<string> {
  const results = await deps.exa.search(params.query, {
    daysBack: params.days_back ?? undefined,
    category: params.category ?? undefined,
  });
  if (results.length === 0) return "No results.";
  return JSON.stringify(
    results.map((r) => ({
      title: r.title,
      url: r.url,
      published: r.publishedDate ?? "unknown",
      author: r.author ?? "",
      // Highlights are the semantically-relevant passages; fall back to text.
      excerpt:
        r.highlights?.join(" … ") ?? r.text?.slice(0, 600) ?? "",
    })),
  );
}

export async function searchExistingExtracts(
  deps: TrackerToolDeps,
  params: { query: string },
): Promise<string> {
  const found = await deps.store.hybridSearch(deps.topic.id, params.query, 8);
  if (found.length === 0) return "No existing extracts match.";
  return JSON.stringify(
    found.map((e) => ({
      id: e.id,
      title: e.title,
      url: e.url,
      gist: e.gist,
      novelty: e.novelty,
      recorded_at: e.created_at,
      corroborations: e.corroborations,
    })),
  );
}

export async function recordExtract(
  deps: TrackerToolDeps,
  params: CreateExtractInput,
): Promise<{ outcome: "created" | "merged"; id: string }> {
  const { outcome, extract } = await deps.store.createExtract(
    deps.topic,
    params,
  );
  return { outcome, id: extract.id };
}

export async function corroborateExtract(
  deps: TrackerToolDeps,
  params: { extract_id: string; url: string },
): Promise<string> {
  await deps.store.corroborateExtract(params.extract_id, params.url);
  return "Corroboration recorded.";
}
