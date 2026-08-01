import { z } from "zod";

// Structured-output schemas shared by the AI pipeline modules.

export const SearchPlanSchema = z.object({
  news_queries: z.array(z.string()).describe("2-3 web search queries for recent news coverage"),
  reddit_queries: z.array(z.string()).describe("1-2 queries for Reddit community discussion"),
  medium_queries: z.array(z.string()).describe("1-2 queries for Medium practitioner articles"),
});
export type SearchPlan = z.infer<typeof SearchPlanSchema>;

export const FollowupQueriesSchema = z.object({
  queries: z
    .array(z.string())
    .describe("1-3 search queries targeting the specific developments found in the news"),
});
export type FollowupQueries = z.infer<typeof FollowupQueriesSchema>;

export const FoundSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  publisher: z.string().describe("Publisher, subreddit (r/...), or Medium author/publication"),
  published_at: z.string().describe("Publication date as reported, ISO if possible, empty string if unknown"),
  snippet: z.string().describe("Short factual snippet of what the source says"),
});
export type FoundSource = z.infer<typeof FoundSourceSchema>;

export const SeekResultSchema = z.object({
  sources: z.array(FoundSourceSchema),
});
export type SeekResult = z.infer<typeof SeekResultSchema>;

export const ExtractSchema = z.object({
  source_type: z.enum(["news", "reddit", "medium"]),
  title: z.string(),
  publisher: z.string(),
  url: z.string(),
  published_at: z.string(),
  gist: z.string().describe("1-2 sentence factual gist of the development or discussion"),
  relevance: z.string().describe("Why this matters for the user's topic and interest areas"),
  novelty: z
    .enum(["new", "update", "repeat"])
    .describe("new = not previously reported; update = meaningful development of something already reported; repeat = already known"),
  contradiction: z
    .string()
    .describe("How this conflicts with prior knowledge or other sources, empty string if none"),
});

export const ExtractionResultSchema = z.object({
  extracts: z.array(ExtractSchema),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const ReportBulletSchema = z.object({
  text: z.string(),
  source_refs: z
    .array(z.number().int())
    .describe("Indexes into the provided sources list that support this bullet"),
});

export const ReportDraftSchema = z.object({
  latest_developments: z.array(ReportBulletSchema),
  community_reaction: z.array(ReportBulletSchema),
  practitioner_view: z.array(ReportBulletSchema),
  cross_source_takeaway: z
    .array(z.string())
    .describe("2-4 point-form takeaways, each one standalone sentence, most important first"),
  what_changed: z.array(ReportBulletSchema),
  no_meaningful_change: z
    .boolean()
    .describe("True if nothing genuinely new or meaningful was found since the previous report"),
  summary: z.string().describe("One sentence summary of this update for the history list"),
  cover_source_ref: z
    .number()
    .int()
    .nullable()
    .describe("Index of the ONE source whose page imagery would best represent this briefing's CENTRAL development (prefer news sources). Null when no source is central enough — a tangential image is worse than none."),
});
export type ReportDraft = z.infer<typeof ReportDraftSchema>;

const FactSchema = z.object({
  fact: z.string(),
  entities: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  source_note: z.string(),
});

/**
 * Memory is updated by DELTA, not full rewrite — the merge happens
 * deterministically in code. Restating unchanged memory every run was the
 * single most expensive call in the pipeline.
 */
export const MemoryUpdateSchema = z.object({
  new_developments: z
    .array(z.object({ text: z.string() }))
    .describe("Developments the user was told about for the FIRST time in this report; under 25 words each. Empty if nothing is new."),
  new_facts: z
    .array(FactSchema)
    .describe("Durable knowledge learned in this report that is NOT already in current memory"),
  obsolete_facts: z
    .array(z.string())
    .describe("Exact 'fact' text of existing facts now contradicted or superseded; to revise one, list it here and add the corrected version to new_facts"),
  new_themes: z
    .array(z.object({ theme: z.string(), trend: z.string() }))
    .describe("Emerging narratives not already tracked, or an existing theme whose trend changed"),
  obsolete_themes: z
    .array(z.string())
    .describe("Exact 'theme' text of themes that no longer apply"),
  new_questions: z
    .array(z.object({ question: z.string(), context: z.string() }))
    .describe("Newly raised unresolved claims, contradictions, or things to watch"),
  resolved_questions: z
    .array(z.string())
    .describe("Exact 'question' text of open questions this report answered"),
});
export type MemoryUpdate = z.infer<typeof MemoryUpdateSchema>;
