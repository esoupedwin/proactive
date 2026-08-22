import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { TopicForm } from "@/components/topic-form";
import { resetTopic, updateTopic } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditTopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ topicId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { topicId } = await params;
  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("id", topicId)
    .maybeSingle<Topic>();
  if (!topic) notFound();

  const boundUpdate = updateTopic.bind(null, topic.id);

  return (
    <TopicForm
      action={boundUpdate}
      topic={topic}
      heading="Edit interest"
      submitLabel="Save changes"
      footer={
        <section
          aria-label="Reset topic"
          className="mt-10 rounded-md border border-red-200 bg-red-50/50 px-4 py-4"
        >
          <h2 className="text-sm font-bold">Reset this topic</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Deletes every report, source, extract and memory this topic has
            accumulated, and starts it afresh. Its settings above — title, goal,
            key factors, schedule — and its experts and their specializations
            are kept. This cannot be undone.
          </p>
          {error === "generating" && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-700">
              An update is being generated right now. Wait for it to finish,
              then reset.
            </p>
          )}
          <form action={resetTopic.bind(null, topic.id)} className="mt-3">
            <SubmitButton
              variant="danger"
              pendingLabel="Resetting…"
              confirm={`Reset "${topic.title}"? Every report, source, extract and memory for this topic will be permanently deleted. Its settings and experts are kept.`}
            >
              Reset topic
            </SubmitButton>
          </form>
        </section>
      }
    />
  );
}
