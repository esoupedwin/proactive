"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "./admin";
import {
  invalidateTierOverrides,
  platformAllowed,
  TIER_SETTINGS_ID,
  TIERS,
  type Platform,
  type TierConfig,
  type Tier,
} from "./ai/tiers";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "./supabase/server";

/**
 * Operator-only actions. Each starts with the same admin gate as /admin:
 * signed in AND on the admin list — otherwise it silently does nothing (an
 * action has no page to 404).
 */
async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return isAdmin(user);
}

/**
 * Saves the tier model overrides from /admin/models. A tier with an empty
 * model field stores no override — it falls back to the TIER_* env config —
 * so clearing every field returns the app to .env entirely.
 */
export async function saveTierModels(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const overrides: Partial<Record<Tier, TierConfig>> = {};
  for (const tier of TIERS) {
    const model = String(formData.get(`${tier}_model`) ?? "").trim();
    if (!model) continue;
    const requested = String(formData.get(`${tier}_platform`) ?? "openai");
    // The dropdown can only send valid platforms, but the constraint is
    // enforced here regardless: a locked tier saves as openai, full stop.
    const platform: Platform =
      requested === "openrouter" && platformAllowed(tier, "openrouter")
        ? "openrouter"
        : "openai";
    overrides[tier] = { platform, model };
  }

  const { error } = await createSupabaseAdminClient()
    .from("app_settings")
    .upsert({
      id: TIER_SETTINGS_ID,
      value: overrides,
      updated_at: new Date().toISOString(),
    });
  if (error) {
    // Most likely migration 0020 has not been applied yet.
    throw new Error(`saving tier models failed: ${error.message}`);
  }

  invalidateTierOverrides();
  revalidatePath("/admin/models");
}
