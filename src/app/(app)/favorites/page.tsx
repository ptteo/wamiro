export const dynamic = "force-dynamic";

import Link from "next/link";

import { Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { listFavorites } from "@/modules/favorites/service";

export const metadata = { title: "Favorites" };

export default async function FavoritesPage() {
  const ctx = await requireAuthPage();
  const items = await listFavorites(ctx.user.organizationId, ctx.user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Favorites</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Your starred projects and articles.</p>
      </header>

      <Card>
        <CardHeader title={`Saved (${items.length})`} />
        {items.length === 0 ? (
          <EmptyState
            title="Nothing starred yet"
            hint="Star projects and knowledge articles to pin them here."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {items.map((f) => (
              <li key={`${f.kind}-${f.refId}`} className="px-5 py-3 text-sm">
                <Link href={f.href} className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand-600)] hover:underline">
                  {f.title}
                </Link>
                <span className="ml-2 text-xs text-[var(--color-muted)]">{f.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
