/**
 * The four model tiers Proactive runs on, each configurable in .env.local as
 * `TIER_<NAME>=platform:model`, e.g.
 *
 *   TIER_JUDGMENT=openai:gpt-5
 *   TIER_SEARCH=openai:gpt-5-mini
 *   TIER_UTILITY=openrouter:deepseek/deepseek-v4-flash
 *   TIER_EMBEDDING=openai:text-embedding-3-small
 *
 * The split is on the FIRST colon only, so OpenRouter variant suffixes keep
 * working: `openrouter:deepseek/deepseek-v4-flash:online`.
 *
 * - judgment: verdicts and analysis — the Reporter loop, Analyst, Personality
 *   stance updates. Either platform; quality is the product here.
 * - search: retrieval-and-extract with OpenAI's hosted web_search tool — the
 *   Tracker, Mentor, Sentiment, baselines, Tell-me-more. OpenAI only: the
 *   hosted tool does not exist elsewhere, so an openrouter setting is
 *   ignored with a warning rather than silently breaking every search.
 * - utility: plain text-in/text-out — summaries and future bulk features.
 *   Either platform; defaults to a cheap OpenRouter model.
 * - embedding: OpenAI only (OpenRouter has no embeddings API).
 *
 * Legacy variables (OPENAI_REPORT_MODEL, OPENAI_SEARCH_MODEL,
 * OPENROUTER_SUMMARY_MODEL, OPENAI_EMBEDDING_MODEL) still apply when the
 * TIER_* variable is unset, so existing .env files keep working unchanged.
 */

export type Tier = "judgment" | "search" | "utility" | "embedding";
export type Platform = "openai" | "openrouter";

export interface TierConfig {
  platform: Platform;
  model: string;
}

/** Tiers whose work is impossible off OpenAI; misconfig clamps with a warning. */
const OPENAI_ONLY: Record<Tier, string | null> = {
  judgment: null,
  search: "the hosted web_search tool only exists on OpenAI",
  utility: null,
  embedding: "OpenRouter has no embeddings API",
};

function legacyDefault(tier: Tier): TierConfig {
  switch (tier) {
    case "judgment":
      return {
        platform: "openai",
        model: process.env.OPENAI_REPORT_MODEL ?? "gpt-5",
      };
    case "search":
      return {
        platform: "openai",
        model: process.env.OPENAI_SEARCH_MODEL ?? "gpt-5-mini",
      };
    case "utility":
      return {
        platform: "openrouter",
        model:
          process.env.OPENROUTER_SUMMARY_MODEL ?? "deepseek/deepseek-v4-flash",
      };
    case "embedding":
      return {
        platform: "openai",
        model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      };
  }
}

/** Parses "platform:model" (first colon only); null when malformed. */
export function parseTierValue(raw: string): TierConfig | null {
  const match = /^(openai|openrouter):(.+)$/.exec(raw.trim());
  if (!match) return null;
  const model = match[2]!.trim();
  if (!model) return null;
  return { platform: match[1] as Platform, model };
}

/** True when this tier may run on the given platform. */
export function platformAllowed(tier: Tier, platform: Platform): boolean {
  return platform === "openai" || OPENAI_ONLY[tier] === null;
}

/** Why a tier is locked to OpenAI, for UI copy; null when it isn't. */
export function platformRestriction(tier: Tier): string | null {
  return OPENAI_ONLY[tier];
}

export const TIERS: Tier[] = ["judgment", "search", "utility", "embedding"];

/**
 * Validates one stored override entry (jsonb from app_settings — untyped by
 * definition). Null when malformed or on a platform the tier cannot use.
 */
export function validateOverride(tier: Tier, raw: unknown): TierConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { platform, model } = raw as { platform?: unknown; model?: unknown };
  if (platform !== "openai" && platform !== "openrouter") return null;
  if (typeof model !== "string" || model.trim() === "") return null;
  if (!platformAllowed(tier, platform)) return null;
  return { platform, model: model.trim() };
}

/** app_settings row id holding the admin's tier overrides. */
export const TIER_SETTINGS_ID = "model_tiers";

type OverrideLoader = () => Promise<Record<string, unknown> | null>;

let overrideCache: {
  at: number;
  value: Record<string, unknown> | null;
} | null = null;
/** Serverless instances refresh their view of the settings this often. */
const OVERRIDE_TTL_MS = 60_000;

/** The admin save action calls this so its own instance updates immediately. */
export function invalidateTierOverrides(): void {
  overrideCache = null;
}

async function defaultLoader(): Promise<Record<string, unknown> | null> {
  // Imported lazily: tiers.ts is also used from unit tests and client-safe
  // modules that must not pull the service-role client in at module load.
  const { createSupabaseAdminClient } = await import("../supabase/server");
  const { data } = await createSupabaseAdminClient()
    .from("app_settings")
    .select("value")
    .eq("id", TIER_SETTINGS_ID)
    .maybeSingle<{ value: Record<string, unknown> }>();
  return data?.value ?? null;
}

/**
 * The platform + model a tier runs on, admin overrides included:
 * app_settings (set at /admin/models) > TIER_* env > legacy env > default.
 * Any failure reading settings (table missing, network) falls back to env —
 * a settings hiccup must never stop reports generating.
 */
export async function resolveTierConfig(
  tier: Tier,
  loader: OverrideLoader = defaultLoader,
): Promise<TierConfig> {
  if (!overrideCache || Date.now() - overrideCache.at > OVERRIDE_TTL_MS) {
    try {
      overrideCache = { at: Date.now(), value: await loader() };
    } catch (err) {
      console.error("loading tier overrides failed; using env config", err);
      overrideCache = { at: Date.now(), value: null };
    }
  }
  const override = overrideCache.value?.[tier];
  return (
    (override !== undefined ? validateOverride(tier, override) : null) ??
    tierConfig(tier)
  );
}

/** The env-and-defaults config, before any admin override. */
export function tierConfig(tier: Tier): TierConfig {
  const raw = process.env[`TIER_${tier.toUpperCase()}`];
  let config = raw ? parseTierValue(raw) : null;
  if (raw && !config) {
    console.warn(
      `TIER_${tier.toUpperCase()}="${raw}" is not platform:model — using the default instead`,
    );
  }
  config ??= legacyDefault(tier);

  const restriction = OPENAI_ONLY[tier];
  if (restriction && config.platform !== "openai") {
    console.warn(
      `TIER_${tier.toUpperCase()} cannot run on ${config.platform} (${restriction}) — falling back to the OpenAI default`,
    );
    return legacyDefault(tier);
  }
  return config;
}
