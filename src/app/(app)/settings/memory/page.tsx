import { createClient } from "@/lib/supabase/server";
import type { Interest, Memory } from "@/lib/types";
import { MemoryManager } from "@/components/MemoryManager";

export default async function MemoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: interests }, { data: memories }] = await Promise.all([
    supabase
      .from("interests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("memories")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Settings &gt; Memory</h1>
      <p className="text-sm text-foreground/60">
        Key points the assistant has learned from your fetches. It uses these to
        focus each new fetch on what has changed — and to skip what you already
        know.
      </p>
      <MemoryManager
        interests={(interests ?? []) as Interest[]}
        memories={(memories ?? []) as Memory[]}
      />
    </div>
  );
}
