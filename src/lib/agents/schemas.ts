import { z } from "zod";

// Structured schemas for the agentic backend: tool parameters and each
// agent's final output. Kept strict-schema friendly (no optional fields —
// the Agents SDK converts these to strict JSON schemas).

// ---- Shared tool parameters ------------------------------------------------

export const ExaSearchParamsSchema = z.object({
  query: z
    .string()
    .describe("Natural-language search — describe the content you want, not keywords"),
  days_back: z
    .number()
    .int()
    .nullable()
    .describe("Only results published within the last N days; null for no limit"),
  category: z
    .enum(["news", "company", "personal site", "publication"])
    .nullable()
    .describe("Optional Exa category filter; null for all content"),
});
export type ExaSearchParams = z.infer<typeof ExaSearchParamsSchema>;

export const SearchExtractsParamsSchema = z.object({
  query: z.string().describe("What to look for among already-recorded extracts"),
});

export const RecordExtractParamsSchema = z.object({
  source_type: z.enum(["news", "reddit", "medium"]),
  title: z.string(),
  publisher: z
    .string()
    .describe("Publisher, subreddit (r/...), or author; empty string if unknown"),
  url: z.string(),
  published_at: z
    .string()
    .describe("Publication date as reported, ISO if possible, empty string if unknown"),
  gist: z
    .string()
    .describe("1-2 sentence factual gist of the development or discussion"),
  relevance: z
    .string()
    .describe("Why this matters for the user's topic and interest areas"),
  novelty: z
    .enum(["new", "update"])
    .describe("new = first time recorded; update = meaningful development of something already recorded"),
  contradiction: z
    .string()
    .describe("How this conflicts with prior knowledge or other sources, empty string if none"),
});
export type RecordExtractParams = z.infer<typeof RecordExtractParamsSchema>;

export const CorroborateExtractParamsSchema = z.object({
  extract_id: z.string().describe("Id of the already-recorded extract"),
  url: z.string().describe("The additional url reporting the same story"),
});

export const RecordAssessmentParamsSchema = z.object({
  extract_id: z.string(),
  assessment: z
    .string()
    .describe("What this extract means for the topic, in 1-2 sentences"),
  significance: z.enum(["high", "medium", "low"]),
});

export const EmptyParamsSchema = z.object({});

// ---- Info Tracker final output ---------------------------------------------

export const TrackerFinalSchema = z.object({
  new_extracts: z.number().int().describe("How many extracts you recorded as new"),
  merged_extracts: z
    .number()
    .int()
    .describe("How many record attempts merged into existing extracts"),
  key_subtopics: z
    .array(z.string())
    .max(10)
    .describe("The currently-active subtopics of this topic, most active first"),
  notes: z
    .string()
    .describe("Anything notable about this run (coverage gaps, emerging angles)"),
});
export type TrackerFinal = z.infer<typeof TrackerFinalSchema>;

// ---- Reporter draft/output -------------------------------------------------

/** Positional-citation bullet, the shape stored in reports.sections. */
export const ReportBulletSchema = z.object({
  text: z.string(),
  source_refs: z
    .array(z.number().int())
    .describe("Indexes into the report's sources that support this bullet"),
});

/** Positional-citation draft — what sanitizeDraft and the UI understand. */
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
  cover_source_ref: z.number().int().nullable(),
});
export type ReportDraft = z.infer<typeof ReportDraftSchema>;

/** Bullet as the Reporter agent emits it — cites extract ids, not indexes. */
export const CitedBulletSchema = z.object({
  text: z.string(),
  extract_ids: z
    .array(z.string())
    .describe("Ids of the extracts that support this bullet"),
});
export type CitedBullet = z.infer<typeof CitedBulletSchema>;

export const ReporterFinalSchema = z.object({
  latest_developments: z.array(CitedBulletSchema),
  community_reaction: z.array(CitedBulletSchema),
  practitioner_view: z.array(CitedBulletSchema),
  cross_source_takeaway: z
    .array(z.string())
    .describe("2-4 point-form takeaways synthesizing across channels, most important first"),
  what_changed: z
    .array(CitedBulletSchema)
    .describe("What is new vs the previous report; may cite nothing when purely narrative"),
  no_meaningful_change: z
    .boolean()
    .describe("True if nothing genuinely new or meaningful happened since the previous report"),
  summary: z.string().describe("One sentence summary of this update for the history list"),
  cover_extract_id: z
    .string()
    .nullable()
    .describe("Id of the ONE extract whose page imagery best represents the briefing's CENTRAL development; null when none is central enough"),
  key_subtopics: z
    .array(z.string())
    .max(10)
    .describe("The currently-active subtopics of this topic, most active first"),
});
export type ReporterFinal = z.infer<typeof ReporterFinalSchema>;
