import type { Model, ModelProvider } from "@openai/agents";
import type { TraceCollector } from "../ai/trace";
import type { UsageCollector } from "../ai/usage";
import type { SearchResult } from "../types";

/**
 * Adapts Agents SDK model turns and tool calls onto the app's existing
 * usage/trace collectors (persisted to reports.usage / reports.trace).
 * All SDK shape assumptions are quarantined here.
 */

/** Structural subset of the SDK's ModelResponse — keeps us duck-typed. */
export interface AgentModelResponse {
  usage: { inputTokens?: number; outputTokens?: number };
  output: Array<{
    type?: string;
    name?: string;
    providerData?: Record<string, unknown>;
  }>;
}

function isWebSearchItem(item: AgentModelResponse["output"][number]): boolean {
  return (
    item?.type === "hosted_tool_call" &&
    typeof item.name === "string" &&
    item.name.includes("web_search")
  );
}

/** Hosted web-search calls issued in one model turn. */
export function countWebSearchCalls(output: AgentModelResponse["output"]): number {
  return output.filter(isWebSearchItem).length;
}

/**
 * What a hosted web-search call actually did — the SDK keeps the Responses
 * API's `action` (search query / opened page) in providerData.
 */
export function describeWebSearch(
  item: AgentModelResponse["output"][number],
): string {
  const action = item.providerData?.action as
    | { type?: string; query?: string; url?: string }
    | undefined;
  if (action?.query) return `Searched: "${action.query}"`;
  if (action?.url) return `Opened: ${action.url}`;
  if (action?.type) return `Action: ${action.type}`;
  return "Web search (no action details reported)";
}

/**
 * URLs a hosted search actually consulted. Only present when the request asked
 * for them via `include: ["web_search_call.action.sources"]` (see the tracker
 * agent) — older stored traces and open_page actions simply have none.
 *
 * The field is documented as a list of sources but its element shape is not
 * guaranteed, so accept a bare URL string or an object and skip anything else.
 */
export function webSearchSources(
  item: AgentModelResponse["output"][number],
): SearchResult[] {
  const action = item.providerData?.action as { sources?: unknown } | undefined;
  if (!Array.isArray(action?.sources)) return [];

  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const raw of action.sources) {
    const source =
      typeof raw === "string"
        ? { url: raw }
        : (raw as { url?: unknown; title?: unknown } | null);
    const url = typeof source?.url === "string" ? source.url : null;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    results.push({
      url,
      ...(typeof source?.title === "string" && source.title
        ? { title: source.title }
        : {}),
    });
  }
  return results;
}

/**
 * Wraps a model provider so every model turn is recorded LIVE, as it
 * happens: token usage, one trace entry per turn, and one entry per hosted
 * web search inside that turn. Because tool calls are also traced live
 * (tracedToolCall), the whole trace reads in true chronological order —
 * turn → its searches → the tools it triggered → next turn.
 */
export function createTracingModelProvider(options: {
  inner: ModelProvider;
  usage?: UsageCollector;
  trace?: TraceCollector;
  tier: "search" | "report";
  model: string;
  agentName: string;
  instructions: string;
  input: string;
}): ModelProvider {
  const { usage, trace } = options;
  let turn = 0;

  const wrap = (model: Model): Model => ({
    async getResponse(request) {
      turn += 1;
      const thisTurn = turn;
      const startedAt = new Date().toISOString();
      const startMs = Date.now();
      let response;
      try {
        response = await model.getResponse(request);
      } catch (err) {
        trace?.record({
          stage: `agent_turn:${options.agentName} (${thisTurn})`,
          agent: options.agentName,
          tier: options.tier,
          model: options.model,
          instructions: options.instructions,
          input: thisTurn === 1 ? options.input : `agent loop turn ${thisTurn}`,
          used_web_search: false,
          web_search_calls: 0,
          input_tokens: 0,
          output_tokens: 0,
          started_at: startedAt,
          duration_ms: Date.now() - startMs,
          error: err instanceof Error ? err.message : "model call failed",
        });
        throw err;
      }

      const output = (response.output ?? []) as AgentModelResponse["output"];
      const webSearchCalls = countWebSearchCalls(output);
      const inputTokens = response.usage?.inputTokens ?? 0;
      const outputTokens = response.usage?.outputTokens ?? 0;
      usage?.record(
        options.model,
        { input_tokens: inputTokens, output_tokens: outputTokens },
        webSearchCalls,
      );
      trace?.record({
        stage: `agent_turn:${options.agentName} (${thisTurn})`,
        agent: options.agentName,
        tier: options.tier,
        model: options.model,
        instructions: options.instructions,
        input: thisTurn === 1 ? options.input : `agent loop turn ${thisTurn}`,
        used_web_search: webSearchCalls > 0,
        web_search_calls: webSearchCalls,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        started_at: startedAt,
        duration_ms: Date.now() - startMs,
      });
      // One entry per hosted web search, so the activity page shows what was
      // actually searched (tokens are already counted on the turn above).
      for (const item of output) {
        if (!isWebSearchItem(item)) continue;
        const results = webSearchSources(item);
        trace?.record({
          stage: "web_search",
          agent: options.agentName,
          tier: options.tier,
          model: options.model,
          instructions: "",
          input: describeWebSearch(item),
          used_web_search: true,
          web_search_calls: 1,
          input_tokens: 0,
          output_tokens: 0,
          started_at: startedAt,
          duration_ms: 0,
          ...(results.length > 0 ? { search_results: results } : {}),
        });
      }
      return response;
    },

    getStreamedResponse(request) {
      // Agents here never stream; delegate untouched if the SDK ever does.
      return model.getStreamedResponse(request);
    },
  });

  return {
    async getModel(modelName) {
      return wrap(await options.inner.getModel(modelName));
    },
  };
}

/**
 * Wraps a tool implementation so every invocation lands in the trace
 * (zero tokens — the model turns account for those).
 */
export function tracedToolCall<Args, Result>(
  options: {
    trace?: TraceCollector;
    tier: "search" | "report";
    model: string;
    name: string;
    agent: string;
  },
  fn: (args: Args) => Promise<Result>,
): (args: Args) => Promise<Result> {
  return async (args: Args) => {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const record = (error?: string) => {
      options.trace?.record({
        stage: `tool:${options.name}`,
        agent: options.agent,
        tier: options.tier,
        model: options.model,
        instructions: "",
        input: JSON.stringify(args),
        used_web_search: false,
        web_search_calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        started_at: startedAt,
        duration_ms: Date.now() - startMs,
        ...(error ? { error } : {}),
      });
    };
    try {
      const result = await fn(args);
      record();
      return result;
    } catch (err) {
      record(err instanceof Error ? err.message : "tool failed");
      throw err;
    }
  };
}
