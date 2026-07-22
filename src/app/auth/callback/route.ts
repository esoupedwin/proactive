import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/allowlist";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (!isEmailAllowed(data.user?.email)) {
        // Not on the allowlist: destroy the session immediately.
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=not_allowed`);
      }
      return NextResponse.redirect(`${origin}/news`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
