import { eq } from "drizzle-orm";

import { SecurityClient } from "@/components/security-client";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/page-auth";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

export const metadata = { title: "Security" };

export default async function SecurityPage() {
  const ctx = await requireAuthPage();
  const [row] = await db
    .select({ totpEnabled: users.totpEnabled })
    .from(users)
    .where(eq(users.id, ctx.user.id))
    .limit(1);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Security</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Protect your account with a second factor.
        </p>
      </header>

      <SecurityClient enabled={row?.totpEnabled ?? false} />

      <Card>
        <div className="px-5 py-4 text-xs leading-relaxed text-[var(--color-muted)]">
          Sessions expire after 14 days. All sign-ins, MFA changes and sensitive actions are
          recorded in your organization&apos;s audit log.
        </div>
      </Card>
    </div>
  );
}
