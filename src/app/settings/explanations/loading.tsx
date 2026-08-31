import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonPageHeader,
} from "@/components/skeleton";

/** Tell me more history — collapsible cards, the newest one open. */
export default function Loading() {
  return (
    <main aria-busy className="px-5 pb-16 pt-6">
      <LoadingAnnouncement label="Loading highlight history" />
      <SkeletonPageHeader titleWidth="w-1/3" />

      <ul className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="rounded-md border border-rule">
            <div className="px-4 py-3">
              <Skeleton className="h-3 w-44" />
              <Skeleton className="mt-2 h-4 w-2/3" />
            </div>
            {/* Only the first card lands open, so only it shows a body. */}
            {i === 0 && (
              <div className="border-t border-rule px-4 py-3">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="mt-2 h-3.5 w-full" />
                <Skeleton className="mt-2 h-3.5 w-3/5" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
