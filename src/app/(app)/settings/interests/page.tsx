import { createClient } from "@/lib/supabase/server";
import type { Interest } from "@/lib/types";
import { InterestManager } from "@/components/InterestManager";

export default async function ManageInterestsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const [{ add }, supabase] = await Promise.all([searchParams, createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: interests } = await supabase
    .from("interests")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">
        Settings &gt; Manage List
      </h1>
      <InterestManager
        interests={(interests ?? []) as Interest[]}
        startWithAddForm={add === "1"}
      />
    </div>
  );
}
