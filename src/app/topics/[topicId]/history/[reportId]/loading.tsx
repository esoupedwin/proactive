import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonReport,
} from "@/components/skeleton";

/** A single archived report. */
export default function Loading() {
  return (
    <main aria-busy className="px-5 pb-16 pt-6">
      <LoadingAnnouncement label="Loading report" />

      <header className="mb-5 border-b border-rule pb-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-7 w-3/5" />
        <Skeleton className="mt-2 h-3 w-44" />
      </header>

      <SkeletonReport />

      <div className="mt-8 border-t border-rule pt-5">
        <Skeleton className="h-11 w-36 rounded-md" />
      </div>
    </main>
  );
}
