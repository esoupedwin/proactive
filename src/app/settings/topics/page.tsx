import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { SettingsHeader } from "@/components/settings-header";
import { TopicRow } from "@/components/topic-row";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Settings → Topic of Interest — the manage list. */
export default async function ManageTopicsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: topicRows } = await supabase
    .from("topics")
    .select("*")
    .order("position")
    .order("created_at");
  const topics = (topicRows ?? []) as Topic[];

  return (
    <main className="px-5 pb-16 pt-6">
      <SettingsHeader
        title="Topic of Interest"
        description="Everything Proactive watches for you."
      />

      <div className="mb-1 flex items-center justify-between border-b border-rule pb-1">
        <h2 className="text-sm font-bold uppercase tracking-wide">
          {topics.length} topic{topics.length === 1 ? "" : "s"}
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
    </main>
  );
}
