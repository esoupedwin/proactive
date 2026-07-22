import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSource, type Interest, type Update } from "@/lib/types";
import { SourceFeed } from "@/components/SourceFeed";

export default async function SourcePage({
  params,
}: {
  params: Promise<{ source: string }>;
}) {
  const { source } = await params;
  if (!isSource(source)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // proxy redirects; defensive only

  const [{ data: interests }, { data: updates }] = await Promise.all([
    supabase
      .from("interests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("updates")
      .select("*")
      .eq("user_id", user.id)
      .eq("source", source),
  ]);

  return (
    <SourceFeed
      source={source}
      interests={(interests ?? []) as Interest[]}
      updates={(updates ?? []) as Update[]}
    />
  );
}
