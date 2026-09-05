// Shared domain types for Proactive.

export type DetailLevel = "brief" | "standard" | "deep";
export type TopicStatus = "active" | "paused";
export type UpdateFrequency = "manual" | "daily" | "every_3_days" | "weekly";
export type ReportStatus = "generating" | "ready" | "error";
export type SourceType = "news" | "reddit" | "medium";
/**
 * How Proactive watches a topic: classic briefing, answering an analytical
 * question, or tracking what's trending (attention + public mood).
 */
export type WatchMode = "monitor" | "question" | "trending";

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
  /** When the briefing was last opened; null means never. See `isTopicUnread`. */
  last_read_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Whether a topic has a report the user hasn't opened yet — a report exists,
 * and it landed after the last time the briefing was read.
 */
export function isTopicUnread(
  topic: Pick<Topic, "last_generated_at" | "last_read_at">,
): boolean {
  if (!topic.last_generated_at) return false;
  if (!topic.last_read_at) return true;
  // Parsed rather than compared as strings: Postgres renders timestamptz with
  // a "+00:00" offset while `toISOString()` writes "Z", so the two spellings
  // of the same instant do not sort against each other.
  return (
    new Date(topic.last_read_at).getTime() <
    new Date(topic.last_generated_at).getTime()
  );
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

/** How a trending subject's attention moved since the previous report. */
export type TrendingMomentum = "new" | "rising" | "steady" | "fading";

/** Trending mode: one subject the public is paying attention to. */
export interface TrendingItem {
  /** What's drawing attention, e.g. "Kimi K3". */
  subject: string;
  momentum: TrendingMomentum;
  /** The public mood in a short phrase, e.g. "mixed — hype vs. cost doubts". */
  mood: string;
  /** What's driving the attention, cited. */
  bullets: ReportBullet[];
  /** One conversational line the user could say about it. */
  talking_point: string;
}

/** Structured report body stored in reports.sections (jsonb). */
/** One standing fact as shown in a report's Current state block. */
export interface SituationFact {
  fact: string;
  kind: FactKind;
  as_of: string | null;
  /** True when this report revised the fact from new evidence. */
  revised?: boolean;
}

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
  /**
   * Question mode only: the standing facts the verdict rested on, as they
   * were at this report. Not rendered on the briefing — kept as a record of
   * the baseline behind each verdict (and spoken in the audio briefing).
   */
  current_state?: SituationFact[];
  /** Trending mode only: what's gaining attention, most traction first. */
  trending?: TrendingItem[];
}

/** Aggregated OpenAI usage for one generation run. */
export interface ModelUsage {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  /**
   * Portion of input_tokens served from OpenAI's prompt cache, billed at a
   * fraction of the input rate. Absent on records stored before this was
   * tracked — those price all input at the full rate, as they always did.
   */
  cached_input_tokens?: number;
}

export interface ReportUsage {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  /** See ModelUsage.cached_input_tokens; absent on older stored records. */
  cached_input_tokens?: number;
  web_search_calls: number;
  by_model: Record<string, ModelUsage>;
  /** Null when a model's pricing is unknown — tokens are still recorded. */
  estimated_cost_usd: number | null;
}

/** One row of the append-only OpenAI-call ledger (llm_calls). */
export interface LlmCall {
  id: string;
  user_id: string;
  topic_id: string | null;
  report_id: string | null;
  /** What the call was for, e.g. "reporter_turn", "explanation", "embedding". */
  activity: string;
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  web_search_calls: number;
  estimated_cost_usd: number | null;
  created_at: string;
}

/** One OpenAI call recorded during report generation. */
export interface LlmCallTrace {
  index: number;
  /** Pipeline stage — the structured-output schema name (e.g. "report_draft"). */
  stage: string;
  /** Which agent produced this call ("info-tracker" | "reporter"); absent for expert/legacy calls. */
  agent?: string;
  /** "report" on rows stored before the tier was renamed to judgment. */
  tier: "search" | "judgment" | "report";
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

/**
 * An agent run that ended before it finished. This is not a call — it happens
 * in the runner, between calls — so it has nowhere to live in `calls` and
 * would otherwise leave the trace looking like a complete run.
 */
export interface AgentRunNote {
  /** Which agent stopped, e.g. "info-tracker". */
  agent: string;
  /** Why it stopped, as reported by the runner. */
  error: string;
  /** The turn budget it was given, when that was the limit it hit. */
  max_turns?: number;
  at: string;
}

export interface ReportTrace {
  calls: LlmCallTrace[];
  /** Absent on traces recorded before runs could report being cut short. */
  notes?: AgentRunNote[];
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

export type ExpertKind = "mentor" | "analyst" | "sentiment" | "personality";
export type MentorLevel = "basic" | "intermediate" | "advanced";
/** What Mentor teaches: general concepts, or the mentioned people/organisations and their relationships. */
export type MentorFocus = "concepts" | "entities";
/**
 * What Personality does: track key players' stances on an issue over time,
 * or profile the people mentioned in each report.
 */
export type PersonalityMode = "stance" | "profiles";

export interface ExpertConfig {
  /** Mentor: how basic or advanced explanations should be. */
  level?: MentorLevel;
  /** Mentor: teaching focus. "entities" fact-checks via web search. */
  teaching_focus?: MentorFocus;
  /** Analyst: its specialization, e.g. "Malaysia's domestic politics, governance, power dynamics, and society". */
  focus?: string;
  /** Personality: which mode this expert runs in. */
  personality_mode?: PersonalityMode;
  /** Personality (stance): the issue stances are tracked against, e.g. "Will UMNO leave the Unity Government?". */
  issue?: string;
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
  /** Point-form reading, one finding per point (current shape). */
  points?: string[];
  /** Prose reading, stored before the point-form redesign. */
  commentary?: string;
}

/** How a tracked personality's stance moved since the previous review. */
export type StanceTrend = "baseline" | "new" | "unchanged" | "shifted";

/** One key player's stance on the tracked issue, as shown on a report. */
export interface PersonalityStance {
  name: string;
  /** Role and influence: why this person's position moves the issue. */
  why_matters: string;
  /** Their current position on the tracked issue, 1-2 sentences. */
  stance: string;
  trend: StanceTrend;
  /** What changed and on what evidence; set when trend is 'shifted' or 'new'. */
  change_note?: string | null;
  /** Portrait from the person's Wikipedia page — never model-supplied. */
  image_url?: string | null;
  image_page_url?: string | null;
}

/** One profiled person from a report (profiles mode). */
export interface PersonalityProfile {
  name: string;
  /** Who they are: role, affiliation chain, background. */
  who: string;
  /** What they said or did in THIS report and why it matters. */
  relevance: string;
  image_url?: string | null;
  image_page_url?: string | null;
}

/** Personality expert output — which fields are present depends on the mode. */
export interface PersonalityOutput {
  mode: PersonalityMode;
  /** Stance mode: the issue the roster is tracked against. */
  issue?: string;
  /** Stance mode: true on the first run, when the roster came from a web scan. */
  baseline?: boolean;
  stances?: PersonalityStance[];
  /** Profiles mode. */
  profiles?: PersonalityProfile[];
}

/** Union payload — which fields are present depends on the expert kind. */
export interface ExpertOutputData {
  tips?: MentorTip[];
  analysis?: AnalystAnalysis;
  sentiment?: SentimentReading;
  personality?: PersonalityOutput;
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


/** One stance revision in a tracked personality's history. */
export interface StanceRevision {
  at: string;
  stance: string;
  note?: string | null;
}

/** Personality (stance mode): one person on the tracked roster. */
export interface TrackedPersonality {
  name: string;
  why_matters: string;
  stance: string;
  /** Every stance this person has held, oldest first — the track record. */
  history: StanceRevision[];
  updated_at: string;
  image_url?: string | null;
  image_page_url?: string | null;
}

/** Union payload — which fields are present depends on the expert kind. */
export interface ExpertMemoryData {
  taught?: TaughtConcept[];
  scenarios?: TrackedScenario[];
  /** Analyst/Personality: max extracts.created_at reviewed (reading cursor). */
  extract_cursor?: string;
  /** Personality (stance): the tracked roster with stance history. */
  personalities?: TrackedPersonality[];
  /** Personality (profiles): names already profiled, most recent last. */
  profiled?: string[];
}

export interface ExpertMemory {
  expert_id: string;
  user_id: string;
  memory: ExpertMemoryData;
  updated_at: string;
}

/** One "Tell me more" lookup: what was highlighted and what it got told. */
export interface Explanation {
  id: string;
  topic_id: string;
  user_id: string;
  selection: string;
  /** The block the selection lived in, kept for provenance. */
  context: string | null;
  explanation: string;
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

/**
 * What kind of standing fact this is, which decides its lifetime:
 * - "rule": structural and stable — the threshold for the outcome, how the
 *   mechanism works ("218 seats controls the House"). Established once.
 * - "state": the current position, which changes ("Republicans hold 53
 *   Senate seats"). Carries an as-of date and gets revised from evidence.
 */
export type FactKind = "rule" | "state";

export interface KnowledgeFact {
  fact: string;
  entities: string[];
  confidence: "high" | "medium" | "low";
  source_note: string;
  /** Absent on facts from the pre-agent pipeline and seed data. */
  kind?: FactKind;
  /** State facts: when this was true, ISO date. Null for rules. */
  as_of?: string | null;
}

/**
 * The Reporter's standing facts are the kinded ones. Facts from the old
 * pipeline and seed data have no kind — they are recorded developments, not
 * a situation — and must never be mistaken for one, or a topic switched to
 * question mode would skip establishing its real baseline.
 */
export function situationFacts(facts: KnowledgeFact[]): KnowledgeFact[] {
  return facts.filter((f) => f.kind !== undefined);
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
  /**
   * Tracker only: the last run ended early (usually its turn budget), so the
   * extracts it left are a partial harvest rather than a full sweep.
   */
  last_run_truncated?: boolean;
  /** Tracker only: why that run ended early. Cleared by the next clean run. */
  last_run_error?: string | null;
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
