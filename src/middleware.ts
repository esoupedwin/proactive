import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/routes";

const PUBLIC_PATHS = ["/login", "/auth"];

/**
 * Refreshes the Supabase session cookie and redirects unauthenticated
 * visitors to /login. API routes handle their own auth.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Carry the page they asked for through sign-in, so a deep link survives
    // the round trip. The root is the default anyway, and an API route is no
    // place to land a person.
    const requested = `${pathname}${request.nextUrl.search}`;
    if (requested !== "/" && !pathname.startsWith("/api/")) {
      url.searchParams.set("next", requested);
    }
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    // Already signed in: honour the destination rather than the login page.
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(next, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the cron API (cron authenticates via secret).
    "/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
