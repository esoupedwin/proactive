import { clsx } from "clsx";

// Placeholder shapes for route-level loading screens. Each `loading.tsx`
// mirrors the real page's layout so the swap to content doesn't jump.

/** A single pulsing block. Size it with `className`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={clsx("animate-pulse rounded bg-neutral-200", className)}
    />
  );
}

/** A paragraph of placeholder lines; the last one runs short. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={clsx("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={clsx("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/**
 * Announces the wait to assistive tech. Sighted users get the shapes; screen
 * reader users get this.
 */
export function LoadingAnnouncement({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

/** Back link + page title, as used by every secondary screen's header. */
export function SkeletonPageHeader({ titleWidth = "w-1/2" }: { titleWidth?: string }) {
  return (
    <header className="mb-6 border-b border-rule pb-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className={clsx("mt-3 h-7", titleWidth)} />
    </header>
  );
}

/** One report section: uppercase rule heading followed by bullets. */
export function SkeletonSection({ bullets = 3 }: { bullets?: number }) {
  return (
    <section>
      <div className="mb-2 border-b border-rule pb-1">
        <Skeleton className="h-3.5 w-36" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: bullets }, (_, i) => (
          <SkeletonText key={i} lines={2} />
        ))}
      </div>
    </section>
  );
}

/** The body of a briefing: hero image, takeaway, then a few sections. */
export function SkeletonReport() {
  return (
    <div className="space-y-7">
      <Skeleton className="aspect-video w-full rounded-md" />
      <section>
        <div className="mb-2 border-b border-rule pb-1">
          <Skeleton className="h-3.5 w-40" />
        </div>
        <SkeletonText lines={3} />
      </section>
      <SkeletonSection bullets={3} />
      <SkeletonSection bullets={2} />
    </div>
  );
}

/** Placeholder for the fixed bottom bar so the page doesn't shift on load. */
export function SkeletonBottomNav() {
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md border-t border-rule bg-paper"
    >
      <div className="flex items-center justify-between gap-1 px-2 py-2">
        <Skeleton className="m-2.5 size-5 rounded-md" />
        <div className="flex items-center gap-1">
          <Skeleton className="m-2.5 size-5 rounded-md" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="m-2.5 size-5 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Label + control pairs, for the topic create/edit forms. */
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-3 w-48" />
        </div>
      ))}
      <Skeleton className="h-11 w-32 rounded-md" />
    </div>
  );
}
