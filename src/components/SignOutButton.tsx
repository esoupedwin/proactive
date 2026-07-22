"use client";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Full navigation so all server-rendered state is discarded.
    window.location.assign("/login");
  }

  return (
    <button
      onClick={signOut}
      className="mt-0.5 text-xs text-foreground/50 underline underline-offset-2 hover:text-foreground"
    >
      Sign out
    </button>
  );
}
