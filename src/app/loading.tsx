import {
  LoadingAnnouncement,
  SkeletonPageHeader,
  SkeletonText,
} from "@/components/skeleton";

/**
 * Generic fallback, inherited by any segment without its own loading.tsx
 * (root redirect, login, onboarding).
 */
export default function Loading() {
  return (
    <main aria-busy className="px-5 pb-16 pt-6">
      <LoadingAnnouncement />
      <SkeletonPageHeader titleWidth="w-2/3" />
      <SkeletonText lines={4} />
      <SkeletonText lines={3} className="mt-6" />
    </main>
  );
}
