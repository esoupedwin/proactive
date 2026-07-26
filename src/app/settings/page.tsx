import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { TopicRow } from "@/components/topic-row";
import { Button, Field, Input, Select } from "@/components/ui";
import {
  signOut,
  updateDisplaySettings,
  updateProfilePreferences,
} from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Profile & Settings — user info, preferences, and the Manage List. */
export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: topicRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    supabase.from("topics").select("*").order("position").order("created_at"),
  ]);
  const topics = (topicRows ?? []) as Topic[];

  return (
    <main className="px-5 pb-16 pt-6">
      <header className="mb-6 border-b border-rule pb-4">
        <Link
          href="/"
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-faint hover:text-ink"
        >
          <LinkPending>
            <ChevronLeft className="size-4" aria-hidden />
          </LinkPending>{" "}
          Back to briefing
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          Profile &amp; Settings
        </h1>
      </header>

      {/* Profile */}
      <section aria-label="Profile" className="mb-8 flex items-center gap-4">
        {profile?.avatar_url ? (
          <Image
            src={profile.avatar_url}
            alt=""
            width={48}
            height={48}
            className="rounded-full border border-rule"
          />
        ) : (
          <div
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full border border-rule bg-neutral-100 text-lg font-bold text-ink-faint"
          >
            {(profile?.display_name ?? user.email ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {profile?.display_name ?? user.email}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs text-ink-faint underline hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>

      {/* Preferences */}
      <section aria-label="Preferences" className="mb-8">
        <h2 className="mb-3 border-b border-rule pb-1 text-sm font-bold uppercase tracking-wide">
          Preferences
        </h2>
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
          <Button type="submit" variant="outline">
            Save preferences
          </Button>
        </form>
      </section>

      {/* Display */}
      <section aria-label="Display" className="mb-8">
        <h2 className="mb-3 border-b border-rule pb-1 text-sm font-bold uppercase tracking-wide">
          Display
        </h2>
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
            Preview: Proactive tracks your topics, remembers what you were
            told, and reports only what changed.
          </p>
          <Button type="submit" variant="outline">
            Save display settings
          </Button>
        </form>
      </section>

      {/* Manage list */}
      <section aria-label="Topics of Interest">
        <div className="mb-1 flex items-center justify-between border-b border-rule pb-1">
          <h2 className="text-sm font-bold uppercase tracking-wide">
            Topics of Interest
          </h2>
          <Link
            href="/topics/new"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium hover:bg-neutral-100"
          >
            <LinkPending>
              <Plus className="size-4" aria-hidden />
            </LinkPending>{" "}
            Add interest
          </Link>
        </div>

        {topics.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">
            No topics yet.{" "}
            <Link href="/topics/new" className="underline">
              Add your first interest
            </Link>
            .
          </p>
        ) : (
          <ul>
            {topics.map((topic) => (
              <TopicRow key={topic.id} topic={topic} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
