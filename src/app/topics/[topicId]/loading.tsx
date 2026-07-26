import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonBottomNav,
  SkeletonReport,
} from "@/components/skeleton";

/** Topic briefing — mirrors the header, report body, and action row. */
export default function Loading() {
  return (
    <main aria-busy className="px-5 pb-28 pt-6">
      <LoadingAnnouncement label="Loading briefing" />

      <header className="mb-5 border-b border-rule pb-4">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-7 w-3/5" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-2 h-3 w-44" />
      </header>

      <SkeletonReport />

      <div className="mt-8 space-y-3 border-t border-rule pt-5">
        <Skeleton className="h-11 w-full rounded-md" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-11 w-28 rounded-md" />
          <Skeleton className="h-11 w-28 rounded-md" />
          <Skeleton className="h-11 w-28 rounded-md" />
          <Skeleton className="h-11 w-20 rounded-md" />
        </div>
      </div>

      <SkeletonBottomNav />
    </main>
  );
}
