import type { TraceCollector } from "../ai/trace";
import type { UsageCollector } from "../ai/usage";

/**
 * Adapts Agents SDK run results and tool calls onto the app's existing
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
 * Records every model turn of an agent run: token usage per turn plus one
 * trace entry per turn (the agent loops internally, so the old one-call-per-
 * stage trace becomes one entry per agent turn).
 */
export function recordAgentRun(options: {
  responses: AgentModelResponse[];
  usage?: UsageCollector;
  trace?: TraceCollector;
  tier: "search" | "report";
  model: string;
  agentName: string;
  instructions: string;
  input: string;
  startedAt: string;
  durationMs: number;
}): void {
  const { responses, usage, trace } = options;
  responses.forEach((response, i) => {
    const webSearchCalls = countWebSearchCalls(response.output ?? []);
    const inputTokens = response.usage?.inputTokens ?? 0;
    const outputTokens = response.usage?.outputTokens ?? 0;
    usage?.record(
      options.model,
      { input_tokens: inputTokens, output_tokens: outputTokens },
      webSearchCalls,
    );
    trace?.record({
      stage: `agent_turn:${options.agentName} (${i + 1}/${responses.length})`,
      agent: options.agentName,
      tier: options.tier,
      model: options.model,
      instructions: options.instructions,
      input: i === 0 ? options.input : `agent loop turn ${i + 1}`,
      used_web_search: webSearchCalls > 0,
      web_search_calls: webSearchCalls,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      started_at: options.startedAt,
      duration_ms: options.durationMs,
    });
    // One entry per hosted web search, so the activity page can show what
    // was actually searched (tokens are already counted on the turn above).
    for (const item of response.output ?? []) {
      if (!isWebSearchItem(item)) continue;
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
        started_at: options.startedAt,
        duration_ms: 0,
      });
    }
  });
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
