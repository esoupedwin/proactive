import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonPageHeader,
} from "@/components/skeleton";

/** Tokens & cost — four stat tiles above a per-step table. */
export default function Loading() {
  return (
    <main aria-busy className="px-5 pb-16 pt-6">
      <LoadingAnnouncement label="Loading token and cost breakdown" />
      <SkeletonPageHeader titleWidth="w-1/2" />

      <div className="mb-6 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-md border border-rule px-3 py-2.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-5 w-16" />
          </div>
        ))}
      </div>

      <div className="border-b border-rule pb-2">
        <Skeleton className="h-3 w-full" />
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex items-start justify-between gap-3 border-b border-rule py-3"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-24 rounded-full" />
          </div>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </main>
  );
}
