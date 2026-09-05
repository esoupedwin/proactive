import OpenAI from "openai";
import { zodResponseFormat, zodTextFormat } from "openai/helpers/zod";
import type { Llm, StructuredCallOptions } from "./llm";
import { resolveTierConfig } from "./tiers";
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

let orClient: OpenAI | null = null;

/** OpenRouter speaks the OpenAI chat-completions dialect — same SDK, new base. */
function getOpenRouter(): OpenAI {
  if (!orClient) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }
    orClient = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  return orClient;
}

/**
 * The Llm implementation, routed per tier: each structured call resolves its
 * tier's platform + model from TIER_* config. The OpenAI path uses the
 * Responses API (structured parse, hosted web search); the OpenRouter path
 * uses chat completions with a JSON-schema response format. Pass a
 * UsageCollector to record tokens/cost into the llm_calls ledger, and a
 * TraceCollector for the per-report prompt log.
 */
export function createOpenAiLlm(
  usage?: UsageCollector,
  trace?: TraceCollector,
): Llm {
  return {
    async structured<T>(options: StructuredCallOptions<T>): Promise<T> {
      const { platform, model: requestedModel } = await resolveTierConfig(
        options.tier,
      );
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

      if (platform === "openrouter") {
        // The hosted web_search tool is OpenAI-only; a tier configured onto
        // OpenRouter must not silently lose its searches.
        if (options.useWebSearch) {
          throw new Error(
            `${options.schemaName} needs hosted web search — configure its tier (${options.tier}) on the openai platform`,
          );
        }
        try {
          const response = await getOpenRouter().chat.completions.parse({
            model: requestedModel,
            messages: [
              { role: "system", content: options.instructions },
              { role: "user", content: options.input },
            ],
            response_format: zodResponseFormat(
              options.schema as never,
              options.schemaName,
            ),
            // OpenRouter extension: report actual billed cost in usage.
            ...({ usage: { include: true } } as object),
          });
          const u = response.usage as
            | (typeof response.usage & { cost?: number })
            | undefined;
          usage?.record(
            response.model ?? requestedModel,
            {
              input_tokens: u?.prompt_tokens ?? 0,
              output_tokens: u?.completion_tokens ?? 0,
              cached_input_tokens:
                u?.prompt_tokens_details?.cached_tokens ?? 0,
              ...(typeof u?.cost === "number" ? { cost_usd: u.cost } : {}),
            },
            0,
            options.schemaName,
          );
          traceCall({
            model: response.model ?? requestedModel,
            web_search_calls: 0,
            input_tokens: u?.prompt_tokens ?? 0,
            output_tokens: u?.completion_tokens ?? 0,
          });
          const parsed = response.choices[0]?.message.parsed as T | null;
          if (parsed == null) {
            throw new Error(
              `OpenRouter returned no parsed output for ${options.schemaName}`,
            );
          }
          return options.schema.parse(parsed);
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
      }

      let response;
      try {
        response = await getOpenAI().responses.parse({
          model: requestedModel,
          instructions: options.instructions,
          input: options.input,
          tools: options.useWebSearch ? [{ type: "web_search" }] : undefined,
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

      usage?.record(
        model,
        {
          input_tokens: response.usage?.input_tokens ?? 0,
          output_tokens: response.usage?.output_tokens ?? 0,
          cached_input_tokens:
            response.usage?.input_tokens_details?.cached_tokens ?? 0,
        },
        webSearchCalls,
        // The schema name doubles as the activity label in the llm_calls
        // ledger ("sentiment_reading", "explanation", "news_query", ...).
        options.schemaName,
      );
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

// No usage-blind instance is exported on purpose: every call site constructs
// createOpenAiLlm(collector) so its spend lands in the llm_calls ledger.

export { getOpenAI as getSharedLlmOpenAI, getOpenRouter as getOpenRouterClient };
