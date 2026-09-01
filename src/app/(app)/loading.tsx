export default function AppLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div>
        <div className="h-6 w-40 animate-pulse rounded bg-surface-subtle" />
        <div className="mt-2 h-3 w-64 animate-pulse rounded bg-surface-subtle" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border-subtle">
        <div className="border-b border-border-subtle bg-surface px-5 py-3">
          <div className="h-3 w-32 animate-pulse rounded bg-surface-subtle" />
        </div>
        <ul className="divide-y divide-border-subtle">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="h-3 w-1/3 animate-pulse rounded bg-surface-subtle" />
              <div className="h-3 w-24 animate-pulse rounded bg-surface-subtle" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
