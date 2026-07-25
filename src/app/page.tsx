import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Root — sends the user to their most recently viewed topic. */
export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  const { data: topics } = await supabase
    .from("topics")
    .select("id")
    .order("position")
    .order("created_at");

  if (!topics || topics.length === 0) redirect("/onboarding");

  const lastViewed = profile?.last_viewed_topic_id;
  const target =
    lastViewed && topics.some((t) => t.id === lastViewed)
      ? lastViewed
      : topics[0]!.id;

  redirect(`/topics/${target}`);
}
