import { TopicForm } from "@/components/topic-form";
import { createTopic } from "@/lib/actions";

export default function NewTopicPage() {
  return (
    <TopicForm
      action={createTopic}
      heading="Add interest"
      submitLabel="Add topic"
    />
  );
}
