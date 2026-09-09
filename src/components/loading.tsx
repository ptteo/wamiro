import { Skeleton } from "@/components/ui";

/**
 * Phase 6 §3 — route-segment skeletons. One file, three shapes; each
 * loading.tsx picks the one matching its page layout so no segment flashes
 * an empty screen during a server render.
 */

export function ListLoading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-3 w-64" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
        <ul className="divide-y divide-border-subtle">
          {Array.from({ length: rows }).map((_, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-24" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function StatGridLoading({ stats = 4, rows = 4 }: { stats?: number; rows?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-3 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: stats }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border-subtle bg-surface px-4 py-3.5">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-2 h-5 w-10" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
        <ul className="divide-y divide-border-subtle">
          {Array.from({ length: rows }).map((_, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-3 w-20" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function BoardLoading({ cards = 8 }: { cards?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div>
        <Skeleton className="h-6 w-36" />
        <Skeleton className="mt-2 h-3 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border-subtle bg-surface p-4">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
            <Skeleton className="mt-4 h-5 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
