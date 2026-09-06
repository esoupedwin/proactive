import { redirect } from "next/navigation";
import { SettingsHeader } from "@/components/settings-header";
import { Button, Field, Input, Select } from "@/components/ui";
import { updateProfilePreferences } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Settings → Profile Preferences — defaults that shape every new report. */
export default async function ProfilePreferencesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_detail_level, expertise_level, notify_email")
    .eq("id", user.id)
    .maybeSingle<
      Pick<Profile, "default_detail_level" | "expertise_level" | "notify_email">
    >();

  return (
    <main className="px-5 pb-16 pt-6">
      <SettingsHeader
        title="Profile Preferences"
        description="Defaults Proactive applies when it writes for you."
      />

      <form action={updateProfilePreferences} className="space-y-4">
        <Field
          label="Default detail level"
          htmlFor="default_detail_level"
          hint="Used as the default for new topics."
        >
          <Select
            id="default_detail_level"
            name="default_detail_level"
            defaultValue={profile?.default_detail_level ?? "standard"}
          >
            <option value="brief">Brief</option>
            <option value="standard">Standard</option>
            <option value="deep">Deep</option>
          </Select>
        </Field>
        <Field
          label="Your background (optional)"
          htmlFor="expertise_level"
          hint="Helps reports match your expertise, e.g. “software engineer”."
        >
          <Input
            id="expertise_level"
            name="expertise_level"
            defaultValue={profile?.expertise_level ?? ""}
            placeholder="e.g. product manager"
          />
        </Field>
        <label className="flex items-start gap-2.5 rounded-md border border-rule px-4 py-3">
          <input
            type="checkbox"
            name="notify_email"
            defaultChecked={profile?.notify_email ?? true}
            className="mt-0.5 size-4 accent-ink"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              Email me when a report is ready
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-faint">
              One short email when a scheduled update finishes, with a link
              to the briefing. Reports you generate by hand never email you.
            </span>
          </span>
        </label>
        <Button type="submit" variant="outline">
          Save preferences
        </Button>
      </form>
    </main>
  );
}
