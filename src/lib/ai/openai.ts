import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { Llm, StructuredCallOptions } from "./llm";
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
 * record token usage + web-search tool calls for every request made
 * through this instance (used for per-report cost accounting).
 */
export function createOpenAiLlm(collector?: UsageCollector): Llm {
  return {
    async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
      const openai = getOpenAI();
      const response = await openai.responses.parse({
        model: modelFor(options.tier),
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

      if (collector) {
        const webSearchCalls =
          response.output?.filter((item) => item.type === "web_search_call")
            .length ?? 0;
        collector.record(
          response.model ?? modelFor(options.tier),
          response.usage,
          webSearchCalls,
        );
      }

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
