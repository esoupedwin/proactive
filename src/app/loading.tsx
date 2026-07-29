import { LoadingAnnouncement } from "@/components/skeleton";

/**
 * App-start splash — inherited by any segment without its own loading.tsx:
 * the root redirect (post-login landing), /topics, /login, /onboarding.
 * Deeper screens use content skeletons instead; this one is branded because
 * at app start there is no layout to skeleton yet.
 */
export default function Loading() {
  return (
    <main
      aria-busy
      className="flex min-h-dvh flex-col items-center justify-center px-6 pb-16"
    >
      <LoadingAnnouncement label="Loading Proactive" />

      <h1 className="text-4xl font-bold tracking-tight">Proactive</h1>
      <p className="mt-2 text-sm text-ink-faint">
        Preparing your briefing…
      </p>

      <span
        aria-hidden
        className="mt-8 inline-block size-6 animate-spin rounded-full border-2 border-rule border-t-ink"
      />
    </main>
  );
}
