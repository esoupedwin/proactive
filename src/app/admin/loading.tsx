import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonPageHeader,
} from "@/components/skeleton";

/** Admin — header, then the signed-in-as card. */
export default function Loading() {
  return (
    <main aria-busy className="px-5 pb-16 pt-6">
      <LoadingAnnouncement label="Loading admin" />
      <SkeletonPageHeader titleWidth="w-1/4" />

      <div className="rounded-md border border-rule px-4 py-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-3 w-52" />
      </div>
    </main>
  );
}
