import { notFound, redirect } from "next/navigation";
import { ModelCatalogProvider } from "@/components/model-combobox";
import { SettingsHeader } from "@/components/settings-header";
import { SubmitButton } from "@/components/submit-button";
import { TierModelFields } from "@/components/tier-model-fields";
import { isAdmin } from "@/lib/admin";
import { saveTierModels } from "@/lib/admin-actions";
import { openAiModels, openRouterModels } from "@/lib/ai/model-catalog";
import {
  platformRestriction,
  TIER_SETTINGS_ID,
  TIERS,
  tierConfig,
  validateOverride,
  type Tier,
  type TierConfig,
} from "@/lib/ai/tiers";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TIER_COPY: Record<Tier, { title: string; description: string }> = {
  judgment: {
    title: "Judgment",
    description:
      "Verdicts and analysis: the Reporter, Analyst, and stance updates. Quality is the product here.",
  },
  search: {
    title: "Search & extract",
    description:
      "The Tracker, Mentor, Sentiment, baselines, and Tell-me-more — needs OpenAI's hosted web_search tool.",
  },
  utility: {
    title: "Utility",
    description:
      "Plain text work: extract summaries and future bulk features. The place for cheap models.",
  },
  embedding: {
    title: "Embedding",
    description: "Vector search over extracts. OpenRouter has no embeddings API.",
  },
};

/**
 * Model tiers — the admin picks each tier's platform and model. Saved values
 * override the TIER_* variables in .env; an empty model field means
 * "use the .env configuration" for that tier.
 */
export default async function AdminModelsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Same posture as /admin: non-admins get a 404, not a hint.
  if (!isAdmin(user)) notFound();

  const { data } = await createSupabaseAdminClient()
    .from("app_settings")
    .select("value")
    .eq("id", TIER_SETTINGS_ID)
    .maybeSingle<{ value: Record<string, unknown> }>();
  // Live catalogues for the model field's autocomplete; [] when unreachable.
  // OpenRouter rows carry that platform's own prices; OpenAI rows show ids
  // only (OpenAI has no pricing API, and the menu doesn't guess).
  const [openrouter, openai] = await Promise.all([
    openRouterModels(),
    openAiModels(),
  ]);

  const overrides: Partial<Record<Tier, TierConfig>> = {};
  for (const tier of TIERS) {
    const stored =
      data?.value?.[tier] !== undefined
        ? validateOverride(tier, data.value[tier])
        : null;
    if (stored) overrides[tier] = stored;
  }

  return (
    <main className="px-5 pb-16 pt-6">
      <SettingsHeader
        title="Model Tiers"
        description="Which platform and model each tier runs on. Saved choices override .env; an empty model falls back to it."
      />

      <ModelCatalogProvider catalogs={{ openai, openrouter }}>
      <form action={saveTierModels} className="space-y-6">
        {TIERS.map((tier) => {
          const env = tierConfig(tier);
          const override = overrides[tier];
          const locked = platformRestriction(tier);
          return (
            <fieldset
              key={tier}
              className="rounded-md border border-rule px-4 py-4"
            >
              <legend className="px-1 text-sm font-bold">
                {TIER_COPY[tier].title}
              </legend>
              <p className="text-xs leading-relaxed text-ink-faint">
                {TIER_COPY[tier].description}
              </p>

              <TierModelFields
                tier={tier}
                locked={locked !== null}
                initialPlatform={override?.platform ?? env.platform}
                modelDefault={override?.model ?? ""}
                placeholder={`${env.model} (from .env)`}
              />

              <p className="mt-2 text-xs text-ink-faint">
                {locked !== null && `Locked to OpenAI: ${locked}. `}
                Currently running:{" "}
                <span className="font-medium text-ink-soft">
                  {(override ?? env).platform}:{(override ?? env).model}
                </span>
                {override ? " (set here)" : " (from .env)"}
              </p>
            </fieldset>
          );
        })}

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel="Saving…">Save model tiers</SubmitButton>
          <p className="text-xs text-ink-faint">
            Changes reach running servers within a minute. Clear a model field
            to return that tier to its .env configuration.
          </p>
        </div>
      </form>
      </ModelCatalogProvider>
    </main>
  );
}
