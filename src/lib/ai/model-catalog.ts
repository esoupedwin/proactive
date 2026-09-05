/**
 * Model catalogues for the admin Model Tiers combobox, one per platform.
 *
 * OpenRouter publishes ids AND prices in one public endpoint, so its rows
 * carry both. OpenAI's /v1/models lists ids only — OpenAI has no pricing
 * API — and by choice its rows show NO price rather than a figure from the
 * app's hand-maintained table: the menu only states prices a platform
 * itself vouches for. Both fetchers cache for an hour and return [] on any
 * failure — the model field is a plain text input either way, so a
 * catalogue is an enhancement, never a dependency.
 */

/** One catalogue entry: id plus USD per 1M tokens (null when unknown). */
export interface ModelInfo {
  id: string;
  prompt_per_m: number | null;
  completion_per_m: number | null;
}

export async function openRouterModels(): Promise<ModelInfo[]> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      data?: Array<{
        id?: unknown;
        pricing?: { prompt?: unknown; completion?: unknown };
      }>;
    };
    const perM = (raw: unknown): number | null => {
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n * 1_000_000 : null;
    };
    return (body.data ?? [])
      .filter(
        (m): m is { id: string; pricing?: { prompt?: unknown; completion?: unknown } } =>
          typeof m.id === "string",
      )
      .map((m) => ({
        id: m.id,
        prompt_per_m: perM(m.pricing?.prompt),
        completion_per_m: perM(m.pricing?.completion),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

/**
 * Keep chat and embedding models; drop the modalities no tier can use
 * (audio, images, moderation, …) so the list stays scannable.
 */
const OPENAI_ID_KEEP = /^(gpt-|o[0-9]|chatgpt-|text-embedding-)/;
const OPENAI_ID_DROP =
  /(audio|realtime|tts|whisper|transcribe|image|moderation|dall-e)/;

export async function openAiModels(): Promise<ModelInfo[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${key}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
    return (body.data ?? [])
      .map((m) => (typeof m.id === "string" ? m.id : null))
      .filter(
        (id): id is string =>
          id !== null && OPENAI_ID_KEEP.test(id) && !OPENAI_ID_DROP.test(id),
      )
      .sort()
      .map((id) => ({ id, prompt_per_m: null, completion_per_m: null }));
  } catch {
    return [];
  }
}
