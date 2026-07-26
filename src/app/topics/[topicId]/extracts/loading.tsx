import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonText,
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

      <ul className="divide-y divide-rule">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="py-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="mt-2 h-4 w-11/12" />
            <Skeleton className="mt-1.5 h-3 w-40" />
            <SkeletonText lines={2} className="mt-2" />
          </li>
        ))}
      </ul>

      <nav className="mt-6 flex items-center justify-between border-t border-rule pt-4">
        <Skeleton className="h-11 w-24 rounded-md" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-11 w-24 rounded-md" />
      </nav>
    </main>
  );
}
