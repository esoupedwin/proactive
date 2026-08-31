import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonPageHeader,
} from "@/components/skeleton";

/** Profile & Settings — avatar block, then the grid of settings tiles. */
export default function Loading() {
  return (
    <main aria-busy className="px-5 pb-16 pt-6">
      <LoadingAnnouncement label="Loading settings" />
      <SkeletonPageHeader titleWidth="w-3/5" />

      <section className="mb-8 flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-16" />
        </div>
      </section>

      <ul className="grid grid-cols-3 gap-x-4 gap-y-6">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <Skeleton className="h-3.5 w-4/5" />
          </li>
        ))}
      </ul>
    </main>
  );
}
