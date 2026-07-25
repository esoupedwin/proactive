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
  cross_source_takeaway: z.string(),
  what_changed: z.array(ReportBulletSchema),
  no_meaningful_change: z
    .boolean()
    .describe("True if nothing genuinely new or meaningful was found since the previous report"),
  summary: z.string().describe("One sentence summary of this update for the history list"),
});
export type ReportDraft = z.infer<typeof ReportDraftSchema>;

export const MemoryUpdateSchema = z.object({
  reported_developments: z
    .array(z.object({ text: z.string() }))
    .describe("Full updated list of developments the user has now been told about"),
  themes: z.array(z.object({ theme: z.string(), trend: z.string() })),
  facts: z.array(
    z.object({
      fact: z.string(),
      entities: z.array(z.string()),
      confidence: z.enum(["high", "medium", "low"]),
      source_note: z.string(),
    }),
  ),
  open_questions: z.array(z.object({ question: z.string(), context: z.string() })),
});
export type MemoryUpdate = z.infer<typeof MemoryUpdateSchema>;
