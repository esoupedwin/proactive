import { notFound } from "next/navigation";
import { TopicForm } from "@/components/topic-form";
import { updateTopic } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Topic } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditTopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
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
    />
  );
}
