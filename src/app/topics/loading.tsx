import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonPageHeader,
} from "@/components/skeleton";

/** Home — a list of topic entries with thumbnails. */
export default function Loading() {
  return (
    <main aria-busy className="px-5 pb-28 pt-6">
      <LoadingAnnouncement label="Loading your topics" />
      <SkeletonPageHeader titleWidth="w-1/3" />

      <ul className="divide-y divide-rule">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="flex items-center gap-4 py-4">
            <Skeleton className="size-20 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-3.5 w-full" />
              <Skeleton className="mt-2 h-3.5 w-3/4" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
