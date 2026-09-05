import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** OAuth callback — exchanges the auth code for a session cookie. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Where the reader was headed before sign-in; sanitised because it arrives
  // in the URL and ends up in a redirect.
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Keep the destination on the retry, so a failed attempt costs no more
  // than the sign-in itself.
  const retry = new URL("/login", origin);
  retry.searchParams.set("error", "auth");
  if (next !== "/") retry.searchParams.set("next", next);
  return NextResponse.redirect(retry);
}
