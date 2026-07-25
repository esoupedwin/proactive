// Shared domain types for Proactive.

export type DetailLevel = "brief" | "standard" | "deep";
export type TopicStatus = "active" | "paused";
export type UpdateFrequency = "manual" | "daily" | "weekly";
export type ReportStatus = "generating" | "ready" | "error";
export type SourceType = "news" | "reddit" | "medium";

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  default_detail_level: DetailLevel;
  expertise_level: string | null;
  /** Body text weight (Lexend variable axis), e.g. 300/400/500. */
  font_weight: number;
  last_viewed_topic_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  user_id: string;
  title: string;
  description: string;
  interest_areas: string[];
  detail_level: DetailLevel;
  frequency: UpdateFrequency;
  status: TopicStatus;
  position: number;
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A single bullet in a report section. `source_refs` are indexes into the report's sources. */
export interface ReportBullet {
  text: string;
  source_refs: number[];
}

/** Cover image selected from the report's own sources. */
export interface HeroImage {
  url: string;
  /** Index into the report's sources — the article the image came from. */
  source_ref: number;
  alt: string;
}

/** Structured report body stored in reports.sections (jsonb). */
export interface ReportSections {
  /** Optional cover image shown above Latest Developments. */
  hero_image?: HeroImage | null;
  latest_developments: ReportBullet[];
  community_reaction: ReportBullet[];
  practitioner_view: ReportBullet[];
  cross_source_takeaway: string;
  what_changed: ReportBullet[];
  /** True when the pipeline judged there was nothing meaningful to add. */
  no_meaningful_change: boolean;
}

/** Aggregated OpenAI usage for one generation run. */
export interface ModelUsage {
  calls: number;
  input_tokens: number;
  output_tokens: number;
}

export interface ReportUsage {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  web_search_calls: number;
  by_model: Record<string, ModelUsage>;
  /** Null when a model's pricing is unknown — tokens are still recorded. */
  estimated_cost_usd: number | null;
}

export interface Report {
  id: string;
  topic_id: string;
  user_id: string;
  status: ReportStatus;
  sections: ReportSections | null;
  summary: string | null;
  /** Current pipeline stage while status is 'generating'. */
  stage: string | null;
  usage: ReportUsage | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Source {
  id: string;
  report_id: string;
  topic_id: string;
  user_id: string;
  source_type: SourceType;
  title: string;
  publisher: string | null;
  url: string;
  published_at: string | null;
  gist: string;
  relevance: string | null;
  novelty: string | null;
  contradiction: string | null;
  created_at: string;
}

// ---- Memory ----------------------------------------------------------------

export interface ReportedDevelopment {
  id: string;
  text: string;
  first_reported_at: string;
}

export interface TopicTheme {
  theme: string;
  trend: string;
}

export interface KnowledgeFact {
  fact: string;
  entities: string[];
  confidence: "high" | "medium" | "low";
  source_note: string;
}

export interface OpenQuestion {
  question: string;
  context: string;
}

export interface TopicMemory {
  topic_id: string;
  user_id: string;
  reported_developments: ReportedDevelopment[];
  themes: TopicTheme[];
  facts: KnowledgeFact[];
  open_questions: OpenQuestion[];
  updated_at: string;
}

/** Empty memory used before the first report exists. */
export function emptyTopicMemory(topicId: string, userId: string): TopicMemory {
  return {
    topic_id: topicId,
    user_id: userId,
    reported_developments: [],
    themes: [],
    facts: [],
    open_questions: [],
    updated_at: new Date(0).toISOString(),
  };
}

// ---- Pipeline intermediates ------------------------------------------------

/** A structured extract produced from one found source, before persistence. */
export interface Extract {
  source_type: SourceType;
  title: string;
  publisher: string;
  url: string;
  published_at: string;
  gist: string;
  relevance: string;
  novelty: "new" | "update" | "repeat";
  contradiction: string;
}
