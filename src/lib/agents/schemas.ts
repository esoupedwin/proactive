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
  factor: z
    .string()
    .nullable()
    .describe("EXACT name of the interest-frame factor this belongs to; null when it fits none"),
  relevance: z
    .string()
    .describe("Why this matters for the user's topic and interest frame"),
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

// Question mode: the Reporter answers the topic's analytical question by
// synthesizing the consolidated extracts against the interest frame.

export const QuestionVerdictSchema = z.object({
  answer: z
    .string()
    .describe("One-sentence current answer to the analytical question"),
  likelihood: z
    .enum(["likely", "possible", "unlikely"])
    .describe("How likely the questioned outcome currently is"),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe("How strongly the evidence supports this verdict"),
  trend: z
    .enum(["baseline", "strengthened", "weakened", "reversed", "unchanged"])
    .describe(
      "baseline = first assessment; otherwise how this verdict moved vs the previous report's verdict",
    ),
  rationale: z
    .array(CitedBulletSchema)
    .describe("The strongest drivers behind the verdict, each cited, most decisive first"),
});

/** One revision the Reporter may make to a standing state fact, from evidence. */
export const SituationUpdateSchema = z.object({
  fact: z
    .string()
    .describe("EXACTLY the existing fact text being revised, verbatim"),
  revised_fact: z
    .string()
    .describe("The fact as it now stands, one sentence, specific"),
  as_of: z
    .string()
    .nullable()
    .describe("When the revised fact became true, YYYY-MM-DD, or null if unknown"),
  extract_ids: z
    .array(z.string())
    .min(1)
    .describe("The extracts that establish the change — never revise without evidence"),
});
export type SituationUpdate = z.infer<typeof SituationUpdateSchema>;

export const FactorAssessmentDraftSchema = z.object({
  factor: z.string().describe("EXACT interest-frame factor name"),
  bullets: z
    .array(CitedBulletSchema)
    .describe("What the evidence says for this factor's key question, cited"),
});

export const QuestionReporterFinalSchema = z.object({
  verdict: QuestionVerdictSchema,
  factor_assessments: z
    .array(FactorAssessmentDraftSchema)
    .describe("One entry per interest-frame factor with meaningful evidence"),
  situation_updates: z
    .array(SituationUpdateSchema)
    .describe(
      "Revisions to 'Where things stand' facts that the cited extracts prove have changed (e.g. a seat count after a special election). Empty when nothing changed. Never revise a rule.",
    ),
  what_changed: z
    .array(CitedBulletSchema)
    .describe("What moved since the previous assessment; may cite nothing when purely narrative"),
  no_meaningful_change: z
    .boolean()
    .describe("True if nothing genuinely new bears on the question since the previous report"),
  summary: z.string().describe("One sentence summary of this assessment for the history list"),
  cover_extract_id: z
    .string()
    .nullable()
    .describe("Id of the ONE extract whose page imagery best represents this assessment's central evidence; null when none is central enough"),
  key_subtopics: z
    .array(z.string())
    .max(10)
    .describe("The currently-active subtopics of this topic, most active first"),
});
export type QuestionReporterFinal = z.infer<typeof QuestionReporterFinalSchema>;

// Trending mode: the Reporter maps what's gaining traction across channels.

export const TrendingItemDraftSchema = z.object({
  subject: z
    .string()
    .describe("What's drawing attention — a model, event, product, person, claim"),
  momentum: z
    .enum(["new", "rising", "steady", "fading"])
    .describe("Attention vs the previous report: new = first appearance on the list"),
  mood: z
    .string()
    .describe("The public mood in one short phrase, e.g. 'mixed — hype over benchmarks, doubts on cost'"),
  bullets: z
    .array(CitedBulletSchema)
    .describe("What's driving the attention and how channels differ, cited"),
  talking_point: z
    .string()
    .describe("ONE natural conversational sentence the user could say to sound informed, e.g. 'Everyone's testing Kimi K3 this week — benchmarks look great but people are split on the pricing.'"),
});

export const TrendingReporterFinalSchema = z.object({
  trending: z
    .array(TrendingItemDraftSchema)
    .max(7)
    .describe("3-7 subjects the public is paying attention to, most traction first"),
  what_changed: z
    .array(CitedBulletSchema)
    .describe("How the attention landscape shifted vs the previous report; may cite nothing when purely narrative"),
  no_meaningful_change: z
    .boolean()
    .describe("True if attention has not meaningfully shifted since the previous report"),
  summary: z.string().describe("One sentence summary of this update for the history list"),
  cover_extract_id: z
    .string()
    .nullable()
    .describe("Id of the ONE extract whose page imagery best represents the top trending subject; null when none fits"),
  key_subtopics: z
    .array(z.string())
    .max(10)
    .describe("The currently-active subtopics of this topic, most active first"),
});
export type TrendingReporterFinal = z.infer<typeof TrendingReporterFinalSchema>;

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
