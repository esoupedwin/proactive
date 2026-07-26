import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonPageHeader,
} from "@/components/skeleton";

/** Report history — a divided list of dated entries. */
export default function Loading() {
  return (
    <main aria-busy className="px-5 pb-16 pt-6">
      <LoadingAnnouncement label="Loading report history" />
      <SkeletonPageHeader titleWidth="w-1/2" />

      <ul className="divide-y divide-rule">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="py-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="mt-2 h-3.5 w-full" />
            <Skeleton className="mt-2 h-3.5 w-4/5" />
          </li>
        ))}
      </ul>
    </main>
  );
}
