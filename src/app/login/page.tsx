"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function LoginForm() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const authError = searchParams.get("error");

  async function signInWithGoogle() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">PROACTIVE</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Stay updated on what matters to you — News, Medium and Reddit,
          summarized.
        </p>
      </div>

      {!CONFIGURED ? (
        <div className="max-w-sm rounded-lg border border-foreground/20 p-4 text-sm text-foreground/70">
          <p className="font-semibold text-foreground">Setup required</p>
          <p className="mt-1">
            Supabase is not configured yet. Copy{" "}
            <code className="font-mono">.env.local.example</code> to{" "}
            <code className="font-mono">.env.local</code> and fill in your keys
            — see <code className="font-mono">SETUP.md</code> for a full
            walkthrough.
          </p>
        </div>
      ) : (
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="flex items-center gap-3 rounded-lg border border-foreground/25 px-5 py-3 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>
      )}

      {authError === "not_allowed" ? (
        <p className="max-w-sm text-center text-sm text-red-600">
          This app is invite-only and your Google account isn&apos;t on the
          allowlist. Contact the owner for access.
        </p>
      ) : authError ? (
        <p className="text-sm text-red-600">
          Sign-in failed. Please try again.
        </p>
      ) : null}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
