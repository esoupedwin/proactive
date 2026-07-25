import type { z } from "zod";

/**
 * Thin LLM abstraction so pipeline modules can be tested with a fake
 * implementation. The real implementation lives in openai.ts.
 */
export interface StructuredCallOptions<T> {
  /** Which configured model tier to use. */
  tier: "search" | "report";
  /** System-style instructions. */
  instructions: string;
  /** User input / task content. */
  input: string;
  schema: z.ZodType<T>;
  schemaName: string;
  /** Enable the web_search tool for this call. */
  useWebSearch?: boolean;
}

export interface Llm {
  structured<T>(options: StructuredCallOptions<T>): Promise<T>;
}
