import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { Llm, StructuredCallOptions } from "./llm";
import type { TraceCollector } from "./trace";
import type { UsageCollector } from "./usage";

let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

function modelFor(tier: "search" | "report"): string {
  return tier === "search"
    ? process.env.OPENAI_SEARCH_MODEL ?? "gpt-5-mini"
    : process.env.OPENAI_REPORT_MODEL ?? "gpt-5";
}

/**
 * OpenAI-backed Llm using the Responses API. Pass a UsageCollector to
 * record token usage + web-search tool calls, and a TraceCollector to
 * record the full prompt flow (per-report transparency).
 */
export function createOpenAiLlm(
  usage?: UsageCollector,
  trace?: TraceCollector,
): Llm {
  return {
    async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
      const openai = getOpenAI();
      const requestedModel = modelFor(options.tier);
      const startedAt = new Date().toISOString();
      const startMs = Date.now();

      const traceCall = (extra: {
        model: string;
        web_search_calls: number;
        input_tokens: number;
        output_tokens: number;
        error?: string;
      }) => {
        trace?.record({
          stage: options.schemaName,
          tier: options.tier,
          instructions: options.instructions,
          input: options.input,
          used_web_search: options.useWebSearch ?? false,
          started_at: startedAt,
          duration_ms: Date.now() - startMs,
          ...extra,
        });
      };

      let response;
      try {
        response = await openai.responses.parse({
          model: requestedModel,
          instructions: options.instructions,
          input: options.input,
          tools: options.useWebSearch
            ? [{ type: "web_search_preview" }]
            : undefined,
          text: {
            // zodTextFormat expects a ZodObject-compatible schema at runtime.
            format: zodTextFormat(options.schema as never, options.schemaName),
          },
        });
      } catch (err) {
        traceCall({
          model: requestedModel,
          web_search_calls: 0,
          input_tokens: 0,
          output_tokens: 0,
          error: err instanceof Error ? err.message : "request failed",
        });
        throw err;
      }

      const webSearchCalls =
        response.output?.filter((item) => item.type === "web_search_call")
          .length ?? 0;
      const model = response.model ?? requestedModel;

      usage?.record(model, response.usage, webSearchCalls);
      traceCall({
        model,
        web_search_calls: webSearchCalls,
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      });

      const parsed = response.output_parsed as T | null;
      if (parsed == null) {
        throw new Error(
          `OpenAI returned no parsed output for ${options.schemaName}`,
        );
      }
      return options.schema.parse(parsed);
    },
  };
}

/** Usage-blind instance for callers that don't need cost accounting. */
export const openAiLlm: Llm = createOpenAiLlm();
