import type { UsageCollector } from "../ai/usage";
import { embeddingModel, getSharedOpenAI } from "./client";

/** Vector dimension — must match extracts.embedding vector(1536). */
export const EMBEDDING_DIMENSIONS = 1536;

const BATCH_SIZE = 64;

export interface Embedder {
  /** Embeds each text; result[i] corresponds to texts[i]. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * OpenAI embeddings (text-embedding-3-small by default). Token usage is
 * recorded on the collector so embedding cost shows up in reports.usage.
 */
export function createOpenAiEmbedder(usage?: UsageCollector): Embedder {
  return {
    async embed(texts) {
      if (texts.length === 0) return [];
      const openai = getSharedOpenAI();
      const model = await embeddingModel();
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const response = await openai.embeddings.create({
          model,
          input: batch,
          dimensions: EMBEDDING_DIMENSIONS,
        });
        usage?.record(
          model,
          { input_tokens: response.usage?.prompt_tokens ?? 0, output_tokens: 0 },
          0,
          "embedding",
        );
        // API returns data in input order; sort by index defensively.
        const sorted = [...response.data].sort((a, b) => a.index - b.index);
        for (const item of sorted) vectors.push(item.embedding);
      }
      return vectors;
    },
  };
}
