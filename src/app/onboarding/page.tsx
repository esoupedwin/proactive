import Link from "next/link";
import { seedSampleTopics } from "@/lib/actions";
import { Button } from "@/components/ui";

/** Shown after first login, before any topics exist. */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">
        What should Proactive track for you?
      </h1>
      <p className="mt-3 text-base leading-relaxed text-ink-soft">
        Add a topic you care about. Proactive will search news, Reddit, and
        Medium, remember what you were told, and brief you on what changed.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Could not create topics: {error}. If this mentions a missing table,
          run <code>supabase/migrations/0001_init.sql</code> in the Supabase
          SQL editor first.
        </p>
      )}

      <div className="mt-10 space-y-3">
        <Link
          href="/topics/new"
          className="flex min-h-11 w-full items-center justify-center rounded-md bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-ink-soft"
        >
          Add your first topic
        </Link>

        <form action={seedSampleTopics}>
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            aria-label="Start with three sample topics"
          >
            Start with sample topics
          </Button>
        </form>
        <p className="text-center text-xs text-ink-faint">
          Samples include “Latest top LLMs”, “US–Iran Conflict”, and “Product
          Management and AI”, with example reports.
        </p>
      </div>
    </main>
  );
}
