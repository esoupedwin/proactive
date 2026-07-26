import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonForm,
} from "@/components/skeleton";

/** Edit interest — the topic form, waiting on the topic row. */
export default function Loading() {
  return (
    <main aria-busy className="px-5 pb-16 pt-6">
      <LoadingAnnouncement label="Loading topic" />
      <header className="mb-6 border-b border-rule pb-4">
        <Skeleton className="h-7 w-40" />
      </header>
      <SkeletonForm fields={4} />
    </main>
  );
}
