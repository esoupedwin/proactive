// Shared domain types for Proactive.

export type DetailLevel = "brief" | "standard" | "deep";
export type TopicStatus = "active" | "paused";
export type UpdateFrequency = "manual" | "daily" | "every_3_days" | "weekly";
export type ReportStatus = "generating" | "ready" | "error";
export type SourceType = "news" | "reddit" | "medium";
/** How Proactive watches a topic: classic briefing vs. answering a question. */
export type WatchMode = "monitor" | "question";

/** One row of a topic's Interest Frame. */
export interface InterestFactor {
  /** Short factor name, e.g. "Political Incentives". */
  name: string;
  /** What this factor should answer, e.g. "Does UMNO gain more by staying?". */
  key_question: string;
  /** Observable indicators to watch, e.g. "polling trends". */
  indicators: string[];
}

/** Factor names only — for prompts and queries that need the flat list. */
export function frameFactorNames(frame: InterestFactor[]): string[] {
  return frame.map((f) => f.name);
}

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
  interest_frame: InterestFactor[];
  /** How this topic is watched; 'question' topics get assessment reports. */
  watch_mode: WatchMode;
  /** The question to answer; set when watch_mode is 'question'. */
  analytical_question: string | null;
  detail_level: DetailLevel;
  frequency: UpdateFrequency;
  status: TopicStatus;
  position: number;
  /** Reusable news-search query, LLM-formulated at topic setup. */
  news_query: string | null;
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
  /** The source page's own image description (og:image:alt), if any. */
  description?: string | null;
}

/** How the current verdict compares to the previous report's. */
export type VerdictTrend =
  | "baseline"
  | "strengthened"
  | "weakened"
  | "reversed"
  | "unchanged";

/** Question mode: the report's answer to the topic's analytical question. */
export interface QuestionVerdict {
  /** One-sentence current answer, e.g. "UMNO is unlikely to leave the UG." */
  answer: string;
  likelihood: ScenarioLikelihood;
  confidence: "low" | "medium" | "high";
  /** 'baseline' on the first assessment; movement vs. the previous one after. */
  trend: VerdictTrend;
  /** The strongest drivers behind the verdict, cited. */
  rationale: ReportBullet[];
}

/** Question mode: what the extracts say about one frame factor. */
export interface FactorAssessment {
  /** Frame factor name this assessment answers for. */
  factor: string;
  bullets: ReportBullet[];
}

/** Structured report body stored in reports.sections (jsonb). */
export interface ReportSections {
  /** Optional cover image shown above Latest Developments. */
  hero_image?: HeroImage | null;
  latest_developments: ReportBullet[];
  community_reaction: ReportBullet[];
  practitioner_view: ReportBullet[];
  /** Point-form takeaways; older stored reports hold a single paragraph string. */
  cross_source_takeaway: string | string[];
  what_changed: ReportBullet[];
  /** True when the pipeline judged there was nothing meaningful to add. */
  no_meaningful_change: boolean;
  /** Question mode only: the overall answer. Absent on monitor reports. */
  verdict?: QuestionVerdict | null;
  /** Question mode only: per-factor assessments against the interest frame. */
  factor_assessments?: FactorAssessment[];
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

/** One OpenAI call recorded during report generation. */
export interface LlmCallTrace {
  index: number;
  /** Pipeline stage — the structured-output schema name (e.g. "report_draft"). */
  stage: string;
  /** Which agent produced this call ("info-tracker" | "reporter"); absent for expert/legacy calls. */
  agent?: string;
  tier: "search" | "report";
  model: string;
  instructions: string;
  input: string;
  used_web_search: boolean;
  web_search_calls: number;
  input_tokens: number;
  output_tokens: number;
  started_at: string;
  duration_ms: number;
  error?: string;
  /** URLs a hosted web search consulted. Absent on non-search calls and on
   *  traces stored before sources were requested. */
  search_results?: SearchResult[];
}

/** One URL returned by a search, for the activity view. */
export interface SearchResult {
  url: string;
  title?: string;
}

export interface ReportTrace {
  calls: LlmCallTrace[];
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
  trace: ReportTrace | null;
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

// ---- Experts ---------------------------------------------------------------

export type ExpertKind = "mentor" | "analyst" | "sentiment";
export type MentorLevel = "basic" | "intermediate" | "advanced";
/** What Mentor teaches: general concepts, or the mentioned people/organisations and their relationships. */
export type MentorFocus = "concepts" | "entities";

export interface ExpertConfig {
  /** Mentor: how basic or advanced explanations should be. */
  level?: MentorLevel;
  /** Mentor: teaching focus. "entities" fact-checks via web search. */
  teaching_focus?: MentorFocus;
  /** Analyst: its specialization, e.g. "Malaysia's domestic politics, governance, power dynamics, and society". */
  focus?: string;
}

/** An LLM module attached to a topic that reads reports and adds output. */
export interface Expert {
  id: string;
  topic_id: string;
  user_id: string;
  kind: ExpertKind;
  name: string;
  status: TopicStatus;
  config: ExpertConfig;
  created_at: string;
  updated_at: string;
}

export interface MentorTip {
  id: string;
  concept: string;
  tip: string;
  /** Deeper follow-up explanation from "Share more", if requested. */
  more?: string | null;
  /** Entity photo/logo from the entity's Wikipedia page (entities focus). */
  image_url?: string | null;
  /** The Wikipedia article the image came from, for attribution. */
  image_page_url?: string | null;
}

export type ScenarioLikelihood = "likely" | "possible" | "unlikely";

export interface AnalystOutlook {
  scenario: string;
  likelihood: ScenarioLikelihood;
  /** Concrete observable indicators that would confirm or kill the scenario. */
  watch_for: string[];
}

export interface AnalystScenarioUpdate {
  scenario: string;
  status: "strengthened" | "weakened" | "resolved";
  note: string;
}

/** What the analyst writes today: standalone commentary through its lens. */
export interface AnalystCommentary {
  commentary: string;
}

/**
 * The structured shape the analyst produced before the commentary redesign.
 * Still stored on past reports, so the renderers keep handling it.
 */
export interface LegacyAnalystAnalysis {
  assessment: string;
  why_it_matters: string[];
  outlook: AnalystOutlook[];
  scenario_updates: AnalystScenarioUpdate[];
  caveats: string;
}

export type AnalystAnalysis = AnalystCommentary | LegacyAnalystAnalysis;

/** Narrows a stored analysis to the current commentary shape. */
export function isAnalystCommentary(
  analysis: AnalystAnalysis,
): analysis is AnalystCommentary {
  return typeof (analysis as AnalystCommentary).commentary === "string";
}

/** Sentiment expert: what Reddit makes of the report's main points. */
export interface SentimentReading {
  commentary: string;
}

/** Union payload — which fields are present depends on the expert kind. */
export interface ExpertOutputData {
  tips?: MentorTip[];
  analysis?: AnalystAnalysis;
  sentiment?: SentimentReading;
  /** OpenAI usage/cost of this expert's run (including later expansions). */
  usage?: ReportUsage;
}

export interface ExpertOutput {
  id: string;
  expert_id: string;
  report_id: string;
  topic_id: string;
  user_id: string;
  kind: ExpertKind;
  output: ExpertOutputData;
  created_at: string;
}

export interface TaughtConcept {
  concept: string;
  status: "taught" | "known" | "revisit";
  times: number;
  last_taught_at: string;
}

export interface MentorMemoryData {
  taught: TaughtConcept[];
}

/**
 * The analyst's forward-scenario track record. Retired with the commentary
 * redesign — kept so memory rows written by earlier runs still type-check.
 */
export interface TrackedScenario {
  id: string;
  scenario: string;
  likelihood: ScenarioLikelihood;
  status: "open" | "strengthened" | "weakened" | "resolved";
  made_at: string;
  last_reviewed_at: string;
  note?: string;
}


/** Union payload — which fields are present depends on the expert kind. */
export interface ExpertMemoryData {
  taught?: TaughtConcept[];
  scenarios?: TrackedScenario[];
  /** Analyst: max extracts.created_at it has reviewed (its reading cursor). */
  extract_cursor?: string;
}

export interface ExpertMemory {
  expert_id: string;
  user_id: string;
  memory: ExpertMemoryData;
  updated_at: string;
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

// ---- Agentic backend (Info Tracker + Reporter) -----------------------------

/** A row in the persistent, topic-scoped extract store (extracts table). */
export interface ExtractRecord {
  id: string;
  topic_id: string;
  user_id: string;
  source_type: SourceType;
  title: string;
  publisher: string | null;
  url: string;
  /** Normalized url (dedupe key within a topic). */
  canonical_url: string;
  published_at: string | null;
  /** Frame factor this extract belongs to; null when it fits none cleanly. */
  factor: string | null;
  gist: string;
  relevance: string | null;
  novelty: string | null;
  contradiction: string | null;
  corroborations: number;
  corroborating_urls: string[];
  duplicate_of: string | null;
  created_at: string;
  last_seen_at: string;
}

export type AssessmentSignificance = "high" | "medium" | "low";

/** The Reporter's judgement of what one extract means for the topic. */
export interface Assessment {
  id: string;
  extract_id: string;
  topic_id: string;
  user_id: string;
  report_id: string | null;
  assessment: string;
  significance: AssessmentSignificance;
  created_at: string;
}

export type AgentName = "tracker" | "reporter";

/** Per-agent memory stored in agent_state.state (jsonb). */
export interface AgentStateData {
  /** Recent key subtopics of the topic, most active first. */
  recent_subtopics?: string[];
  /** Reporter only: max extracts.created_at already processed. */
  cursor?: string;
  last_run_at?: string;
}

export type FeedbackRating = "up" | "down";

export interface ReportFeedback {
  id: string;
  report_id: string;
  topic_id: string;
  user_id: string;
  rating: FeedbackRating;
  comment: string | null;
  created_at: string;
}
