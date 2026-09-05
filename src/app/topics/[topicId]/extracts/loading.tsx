import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonExtractList,
} from "@/components/skeleton";

/** Extracts — badge row, headline, publisher line, gist, per entry. */
export default function Loading() {
  return (
    <main aria-busy className="px-5 pb-16 pt-6">
      <LoadingAnnouncement label="Loading extracts" />

      <header className="mb-6 border-b border-rule pb-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-7 w-40" />
        <Skeleton className="mt-2 h-3 w-full max-w-[18rem]" />
      </header>

      {/* The filter field, which the page renders above the list. */}
      <div className="mb-5 max-w-xs">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-1 h-11 w-full rounded-md" />
      </div>

      <SkeletonExtractList />
    </main>
  );
}
