import OpenAI from "openai";
import { resolveTierConfig } from "./tiers";
import type { UsageCollector } from "./usage";

/**
 * OpenRouter client for secondary AI features on cheaper non-OpenAI models.
 * OpenAI remains the engine for the agents and experts; a feature goes
 * through OpenRouter only by naming one of the models configured below.
 *
 * Plain chat completions rather than the Llm interface on purpose: the Llm
 * abstraction is built on OpenAI's Responses API (structured parse, hosted
 * web search), which OpenRouter doesn't speak, and text-out features like
 * summaries don't need it.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function openRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** Whether the utility tier can run as currently configured. */
export async function utilityTierAvailable(): Promise<boolean> {
  const { platform } = await resolveTierConfig("utility");
  return platform === "openai"
    ? Boolean(process.env.OPENAI_API_KEY)
    : openRouterConfigured();
}

/**
 * One plain text completion on the utility tier, whichever platform it is
 * configured on. The workhorse for cheap secondary features — summaries,
 * rewrites, classification.
 */
export async function utilityComplete(options: {
  instructions: string;
  input: string;
  maxOutputTokens?: number;
  enableReasoning?: boolean;
  usage?: UsageCollector;
  activity?: string;
}): Promise<string> {
  const { platform, model } = await resolveTierConfig("utility");
  if (platform === "openrouter") {
    return openRouterComplete({ ...options, model });
  }

  // OpenAI path: same chat-completions shape against api.openai.com.
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: options.instructions },
      { role: "user", content: options.input },
    ],
    max_completion_tokens: options.maxOutputTokens ?? 1024,
  });
  options.usage?.record(
    response.model ?? model,
    {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
      cached_input_tokens:
        response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
    0,
    options.activity ?? "utility_call",
  );
  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("utility model returned no content");
  return text;
}

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  /** Actual billed credits (USD) when usage.include is requested. */
  cost?: number;
}

/**
 * One chat completion over OpenRouter. Records tokens and the provider's own
 * billed cost on the collector so the call lands in the llm_calls ledger
 * without needing a price-table entry per OpenRouter model.
 */
export async function openRouterComplete(options: {
  model: string;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
  /**
   * Explicitly enable or disable the model's reasoning phase (OpenRouter
   * normalizes this across providers). Omit to use the model's default.
   * Reasoning models like DeepSeek v4 Flash think BEFORE answering and the
   * thinking spends output budget — a small max_tokens can be consumed
   * entirely by reasoning, returning no content at all.
   */
  enableReasoning?: boolean;
  usage?: UsageCollector;
  /** Ledger activity label, e.g. "extracts_summary". */
  activity?: string;
}): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: "system", content: options.instructions },
        { role: "user", content: options.input },
      ],
      max_tokens: options.maxOutputTokens ?? 1024,
      ...(options.enableReasoning === undefined
        ? {}
        : { reasoning: { enabled: options.enableReasoning } }),
      // Ask OpenRouter to report actual billed cost in the usage block.
      usage: { include: true },
    }),
  });

  const body = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: OpenRouterUsage;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(
      `OpenRouter request failed (${response.status}): ${
        body?.error?.message ?? "unknown error"
      }`,
    );
  }

  const usage = body?.usage;
  options.usage?.record(
    options.model,
    {
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
      cached_input_tokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
      ...(typeof usage?.cost === "number" ? { cost_usd: usage.cost } : {}),
    },
    0,
    options.activity ?? "openrouter_call",
  );

  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenRouter returned no content");
  }
  return text;
}
