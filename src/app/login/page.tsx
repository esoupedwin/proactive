"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button, Spinner } from "@/components/ui";

function LoginContent() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const authFailed = searchParams.get("error") === "auth";

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });
    if (oauthError) {
      setError("Sign-in failed. Please try again.");
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Proactive</h1>
      <p className="mt-3 max-w-xs text-base leading-relaxed text-ink-soft">
        Stay continuously informed about the topics that matter to you.
      </p>
      <p className="mt-1 max-w-xs text-sm leading-relaxed text-ink-faint">
        A personal research companion that tracks developments, remembers what
        you already know, and reports only what changed.
      </p>

      <div className="mt-10">
        <Button
          onClick={signInWithGoogle}
          disabled={pending}
          className="w-full"
          aria-label="Continue with Google"
        >
          {pending ? <Spinner /> : <GoogleMark />}
          Continue with Google
        </Button>
        {(error || authFailed) && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error ?? "Sign-in did not complete. Please try again."}
          </p>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4">
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 3.9-5.35 3.9a6 6 0 1 1 0-12c1.5 0 2.9.55 4 1.45l2.15-2.15A9 9 0 1 0 12 21c5.2 0 8.85-3.65 8.85-8.85 0-.35-.05-.7-.1-1.05Z"
      />
    </svg>
  );
}
