import { redirect } from "next/navigation";
import { SettingsHeader } from "@/components/settings-header";
import { Button, Field, Select } from "@/components/ui";
import { updateDisplaySettings } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Settings → Display Preferences — how reading text appears. */
export default async function DisplaySettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("font_weight")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "font_weight">>();

  return (
    <main className="px-5 pb-16 pt-6">
      <SettingsHeader
        title="Display Preferences"
        description="How briefings read on screen."
      />

      <form action={updateDisplaySettings} className="space-y-4">
        <Field
          label="Body text weight"
          htmlFor="font_weight"
          hint="How heavy regular reading text appears. Headings stay bold."
        >
          <Select
            id="font_weight"
            name="font_weight"
            defaultValue={String(profile?.font_weight ?? 400)}
          >
            <option value="300">Light (300)</option>
            <option value="400">Regular (400)</option>
            <option value="500">Medium (500)</option>
          </Select>
        </Field>
        <p
          className="rounded-md border border-rule bg-neutral-50 px-4 py-3 text-sm leading-relaxed"
          style={{ fontWeight: profile?.font_weight ?? 400 }}
        >
          Preview: Proactive tracks your topics, remembers what you were told,
          and reports only what changed.
        </p>
        <Button type="submit" variant="outline">
          Save display settings
        </Button>
      </form>
    </main>
  );
}
