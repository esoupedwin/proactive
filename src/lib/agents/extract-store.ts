import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUrl } from "../ai/dedupe";
import { situationFacts } from "../types";
import type {
  AgentName,
  AgentStateData,
  Assessment,
  AssessmentSignificance,
  ExtractRecord,
  KnowledgeFact,
  ReportFeedback,
  SourceType,
  Topic,
} from "../types";
import type { Embedder } from "./embeddings";

/**
 * Persistence boundary for the agentic backend. The extracts table is the
 * Info Tracker's output and the Reporter's input; both agents keep their
 * memory in agent_state. Supabase-backed in production; in-memory in tests.
 */

export interface CreateExtractInput {
  source_type: SourceType;
  title: string;
  publisher: string;
  url: string;
  published_at: string;
  /** Interest-frame factor this belongs to; null when it fits none. */
  factor: string | null;
  gist: string;
  relevance: string;
  novelty: "new" | "update";
  contradiction: string;
}

export interface FeedbackWithContext extends ReportFeedback {
  /** Summary of the rated report, for the Reporter's context. */
  report_summary?: string | null;
}

export interface ExtractStore {
  /** Hybrid semantic + keyword search over the topic's extracts. */
  hybridSearch(
    topicId: string,
    query: string,
    count?: number,
  ): Promise<ExtractRecord[]>;
  /** Extracts in created_at ascending order, optionally after a cursor. */
  recentExtracts(
    topicId: string,
    opts?: { afterCreatedAt?: string; limit?: number },
  ): Promise<ExtractRecord[]>;
  /**
   * Records an extract. Same (topic, canonical_url) merges into the existing
   * row instead (corroboration), so repeated tracker runs are idempotent.
   */
  createExtract(
    topic: Topic,
    input: CreateExtractInput,
  ): Promise<{ outcome: "created" | "merged"; extract: ExtractRecord }>;
  /** Marks an existing extract as corroborated by another url. */
  corroborateExtract(extractId: string, url: string): Promise<void>;
  getAgentState(topicId: string, agent: AgentName): Promise<AgentStateData>;
  saveAgentState(
    topic: Topic,
    agent: AgentName,
    state: AgentStateData,
  ): Promise<void>;
  recordAssessment(
    topic: Topic,
    input: {
      extract_id: string;
      report_id: string | null;
      assessment: string;
      significance: AssessmentSignificance;
    },
  ): Promise<void>;
  recentAssessments(topicId: string, limit?: number): Promise<Assessment[]>;
  recentFeedback(
    topicId: string,
    limit?: number,
  ): Promise<FeedbackWithContext[]>;
  /**
   * The topic's standing facts (the kinded entries of topic_memory.facts);
   * empty when none. Legacy kind-less facts are not returned.
   */
  getTopicFacts(topicId: string): Promise<KnowledgeFact[]>;
  /**
   * Replaces topic_memory.facts wholesale. The first save by this feature
   * retires any legacy kind-less facts — they belonged to a pipeline that
   * no longer runs.
   */
  saveTopicFacts(topic: Topic, facts: KnowledgeFact[]): Promise<void>;
}

/** Text embedded for an extract — keep in sync between create and search. */
export function extractEmbeddingText(title: string, gist: string): string {
  return `${title} — ${gist}`;
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

export function createSupabaseExtractStore(
  supabase: SupabaseClient,
  embedder: Embedder,
): ExtractStore {
  async function embedOne(text: string): Promise<number[] | null> {
    try {
      const [vector] = await embedder.embed([text]);
      return vector ?? null;
    } catch (err) {
      // An extract without an embedding still keyword-searches; never block on it.
      console.error("embedding failed", err);
      return null;
    }
  }

  return {
    async hybridSearch(topicId, query, count = 8) {
      const embedding = await embedOne(query);
      if (!embedding) {
        // Keyword-only fallback via the same RPC is impossible without a
        // vector; fall back to recency + client-side keyword filter.
        const { data } = await supabase
          .from("extracts")
          .select("*")
          .eq("topic_id", topicId)
          .order("created_at", { ascending: false })
          .limit(count * 3);
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        return ((data as ExtractRecord[]) ?? [])
          .filter((e) =>
            words.some((w) => `${e.title} ${e.gist}`.toLowerCase().includes(w)),
          )
          .slice(0, count);
      }
      const { data, error } = await supabase.rpc("search_extracts_hybrid", {
        p_topic_id: topicId,
        p_query: query,
        p_embedding: embedding,
        p_count: count,
      });
      if (error) throw new Error(`hybrid search failed: ${error.message}`);
      return (data as ExtractRecord[]) ?? [];
    },

    async recentExtracts(topicId, opts = {}) {
      let query = supabase
        .from("extracts")
        .select("*")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: true })
        .limit(opts.limit ?? 40);
      if (opts.afterCreatedAt) {
        query = query.gt("created_at", opts.afterCreatedAt);
      }
      const { data, error } = await query;
      if (error) throw new Error(`loading extracts failed: ${error.message}`);
      return (data as ExtractRecord[]) ?? [];
    },

    async createExtract(topic, input) {
      const canonical = normalizeUrl(input.url);
      const embedding = await embedOne(
        extractEmbeddingText(input.title, input.gist),
      );
      const { data, error } = await supabase
        .from("extracts")
        .insert({
          topic_id: topic.id,
          user_id: topic.user_id,
          source_type: input.source_type,
          title: input.title,
          publisher: input.publisher || null,
          url: input.url,
          canonical_url: canonical,
          published_at: input.published_at || null,
          factor: input.factor || null,
          gist: input.gist,
          relevance: input.relevance || null,
          novelty: input.novelty,
          contradiction: input.contradiction || null,
          embedding,
        })
        .select()
        .single();
      if (!error) {
        return { outcome: "created", extract: data as ExtractRecord };
      }
      if (error.code !== "23505") {
        throw new Error(`creating extract failed: ${error.message}`);
      }
      // Unique violation → the story is already recorded; merge as corroboration.
      const { data: existing, error: fetchError } = await supabase
        .from("extracts")
        .select("*")
        .eq("topic_id", topic.id)
        .eq("canonical_url", canonical)
        .single();
      if (fetchError || !existing) {
        throw new Error(
          `extract merge lookup failed: ${fetchError?.message ?? "not found"}`,
        );
      }
      const row = existing as ExtractRecord;
      const urls = new Set(row.corroborating_urls);
      if (input.url !== row.url) urls.add(input.url);
      const patch = {
        corroborations: row.corroborations + 1,
        corroborating_urls: [...urls],
        last_seen_at: new Date().toISOString(),
      };
      await supabase.from("extracts").update(patch).eq("id", row.id);
      return { outcome: "merged", extract: { ...row, ...patch } };
    },

    async corroborateExtract(extractId, url) {
      const { data } = await supabase
        .from("extracts")
        .select("*")
        .eq("id", extractId)
        .maybeSingle();
      if (!data) return;
      const row = data as ExtractRecord;
      const urls = new Set(row.corroborating_urls);
      if (url && url !== row.url) urls.add(url);
      await supabase
        .from("extracts")
        .update({
          corroborations: row.corroborations + 1,
          corroborating_urls: [...urls],
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", extractId);
    },

    async getAgentState(topicId, agent) {
      const { data } = await supabase
        .from("agent_state")
        .select("state")
        .eq("topic_id", topicId)
        .eq("agent", agent)
        .maybeSingle();
      return (data?.state as AgentStateData) ?? {};
    },

    async saveAgentState(topic, agent, state) {
      const { error } = await supabase.from("agent_state").upsert({
        topic_id: topic.id,
        agent,
        user_id: topic.user_id,
        state,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(`saving agent state failed: ${error.message}`);
    },

    async recordAssessment(topic, input) {
      const { error } = await supabase.from("assessments").insert({
        extract_id: input.extract_id,
        topic_id: topic.id,
        user_id: topic.user_id,
        report_id: input.report_id,
        assessment: input.assessment,
        significance: input.significance,
      });
      if (error) throw new Error(`recording assessment failed: ${error.message}`);
    },

    async recentAssessments(topicId, limit = 20) {
      const { data } = await supabase
        .from("assessments")
        .select("*")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data as Assessment[]) ?? [];
    },

    async recentFeedback(topicId, limit = 5) {
      const { data } = await supabase
        .from("report_feedback")
        .select("*")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: false })
        .limit(limit);
      const feedback = (data as ReportFeedback[]) ?? [];
      if (feedback.length === 0) return [];
      const reportIds = [...new Set(feedback.map((f) => f.report_id))];
      const { data: reports } = await supabase
        .from("reports")
        .select("id, summary")
        .in("id", reportIds);
      const summaries = new Map(
        ((reports as { id: string; summary: string | null }[]) ?? []).map(
          (r) => [r.id, r.summary],
        ),
      );
      return feedback.map((f) => ({
        ...f,
        report_summary: summaries.get(f.report_id) ?? null,
      }));
    },

    async getTopicFacts(topicId) {
      const { data } = await supabase
        .from("topic_memory")
        .select("facts")
        .eq("topic_id", topicId)
        .maybeSingle<{ facts: KnowledgeFact[] | null }>();
      return situationFacts(data?.facts ?? []);
    },

    async saveTopicFacts(topic, facts) {
      // topic_memory has one row per topic; the other columns are leftovers
      // from the pre-agent pipeline and keep their defaults on first insert.
      const { error } = await supabase.from("topic_memory").upsert(
        {
          topic_id: topic.id,
          user_id: topic.user_id,
          facts,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "topic_id" },
      );
      if (error) throw new Error(`saving topic facts failed: ${error.message}`);
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory store (tests)
// ---------------------------------------------------------------------------

export function createInMemoryExtractStore(): ExtractStore & {
  extracts: ExtractRecord[];
  assessments: Assessment[];
  states: Map<string, AgentStateData>;
  feedback: FeedbackWithContext[];
  facts: Map<string, KnowledgeFact[]>;
} {
  const extracts: ExtractRecord[] = [];
  const assessments: Assessment[] = [];
  const states = new Map<string, AgentStateData>();
  const feedback: FeedbackWithContext[] = [];
  const facts = new Map<string, KnowledgeFact[]>();
  let counter = 0;

  return {
    extracts,
    assessments,
    states,
    feedback,
    facts,

    async hybridSearch(topicId, query, count = 8) {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      return extracts
        .filter((e) => e.topic_id === topicId)
        .map((e) => {
          const haystack = `${e.title} ${e.gist}`.toLowerCase();
          const score = words.filter((w) => haystack.includes(w)).length;
          return { e, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map(({ e }) => e);
    },

    async recentExtracts(topicId, opts = {}) {
      return extracts
        .filter(
          (e) =>
            e.topic_id === topicId &&
            (!opts.afterCreatedAt || e.created_at > opts.afterCreatedAt),
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(0, opts.limit ?? 40);
    },

    async createExtract(topic, input) {
      const canonical = normalizeUrl(input.url);
      const existing = extracts.find(
        (e) => e.topic_id === topic.id && e.canonical_url === canonical,
      );
      if (existing) {
        existing.corroborations += 1;
        if (input.url !== existing.url) {
          existing.corroborating_urls = [
            ...new Set([...existing.corroborating_urls, input.url]),
          ];
        }
        existing.last_seen_at = new Date().toISOString();
        return { outcome: "merged", extract: existing };
      }
      counter += 1;
      const extract: ExtractRecord = {
        id: `extract-${counter}`,
        topic_id: topic.id,
        user_id: topic.user_id,
        source_type: input.source_type,
        title: input.title,
        publisher: input.publisher || null,
        url: input.url,
        canonical_url: canonical,
        published_at: input.published_at || null,
        factor: input.factor || null,
        gist: input.gist,
        relevance: input.relevance || null,
        novelty: input.novelty,
        contradiction: input.contradiction || null,
        corroborations: 0,
        corroborating_urls: [],
        duplicate_of: null,
        created_at: new Date(Date.now() + counter).toISOString(),
        last_seen_at: new Date().toISOString(),
      };
      extracts.push(extract);
      return { outcome: "created", extract };
    },

    async corroborateExtract(extractId, url) {
      const row = extracts.find((e) => e.id === extractId);
      if (!row) return;
      row.corroborations += 1;
      if (url && url !== row.url) {
        row.corroborating_urls = [...new Set([...row.corroborating_urls, url])];
      }
      row.last_seen_at = new Date().toISOString();
    },

    async getAgentState(topicId, agent) {
      return states.get(`${topicId}:${agent}`) ?? {};
    },

    async saveAgentState(topic, agent, state) {
      states.set(`${topic.id}:${agent}`, state);
    },

    async recordAssessment(topic, input) {
      counter += 1;
      assessments.push({
        id: `assessment-${counter}`,
        extract_id: input.extract_id,
        topic_id: topic.id,
        user_id: topic.user_id,
        report_id: input.report_id,
        assessment: input.assessment,
        significance: input.significance,
        created_at: new Date().toISOString(),
      });
    },

    async recentAssessments(topicId, limit = 20) {
      return assessments
        .filter((a) => a.topic_id === topicId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
    },

    async recentFeedback(topicId, limit = 5) {
      return feedback
        .filter((f) => f.topic_id === topicId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
    },

    async getTopicFacts(topicId) {
      return situationFacts(facts.get(topicId) ?? []);
    },

    async saveTopicFacts(topic, next) {
      facts.set(topic.id, next);
    },
  };
}
