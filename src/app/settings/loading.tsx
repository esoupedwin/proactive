import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonPageHeader,
} from "@/components/skeleton";

/** Profile & Settings — avatar block, two preference forms, interests list. */
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

      {[0, 1].map((section) => (
        <section key={section} className="mb-8">
          <div className="mb-3 border-b border-rule pb-1">
            <Skeleton className="h-3.5 w-28" />
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-11 w-full rounded-md" />
              <Skeleton className="h-3 w-52" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-11 w-full rounded-md" />
            </div>
            <Skeleton className="h-11 w-40 rounded-md" />
          </div>
        </section>
      ))}

      <section>
        <div className="mb-1 flex items-center justify-between border-b border-rule pb-1">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>
        <ul>
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="border-b border-rule">
              <div className="flex items-center gap-1 py-2">
                <div className="min-w-0 flex-1 py-1">
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Skeleton className="m-2.5 size-4 rounded" />
                  <Skeleton className="m-2.5 size-4 rounded" />
                  <Skeleton className="m-2.5 size-4 rounded" />
                  <Skeleton className="m-2.5 size-4 rounded" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
