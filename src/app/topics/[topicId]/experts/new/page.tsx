import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { LinkPending } from "@/components/link-pending";
import { NewExpertForm } from "@/components/new-expert-form";
import { addAnalystExpert, addMentorExpert } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Expert, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Add an expert to a topic: choose the kind, then fill in its details. */
export default async function NewExpertPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, title")
    .eq("id", topicId)
    .maybeSingle<Pick<Topic, "id" | "title">>();
  if (!topic) notFound();

  const { data: mentorRow } = await supabase
    .from("experts")
    .select("id")
    .eq("topic_id", topicId)
    .eq("kind", "mentor")
    .maybeSingle<Pick<Expert, "id">>();

  return (
    <main className="px-5 pb-16 pt-6">
      <header className="mb-6 border-b border-rule pb-4">
        <Link
          href={`/topics/${topicId}/experts`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-faint hover:text-ink"
        >
          <LinkPending>
            <ChevronLeft className="size-4" aria-hidden />
          </LinkPending>{" "}
          Experts
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Add New Expert</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          {topic.title}
        </p>
      </header>

      <NewExpertForm
        topicId={topicId}
        mentorExists={Boolean(mentorRow)}
        addMentor={addMentorExpert.bind(null, topicId)}
        addAnalyst={addAnalystExpert.bind(null, topicId)}
      />
    </main>
  );
}
