import { eq } from "drizzle-orm";

import { SecurityClient } from "@/components/security-client";
import { PageHeader } from "@/components/page-header";
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
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Security"
        subtitle="How this account signs in, and how long a session lasts."
      />

      <SecurityClient enabled={row?.totpEnabled ?? false} />

      <section className="rounded-lg border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-primary">Session</h2>
        </div>
        <ul className="divide-y divide-border-subtle text-sm">
          <li className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span className="text-tertiary">Expires after</span>
            <span className="text-primary">14 days of inactivity</span>
          </li>
          <li className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span className="text-tertiary">Cookie</span>
            <span className="text-primary">httpOnly, SameSite=Lax</span>
          </li>
          <li className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span className="text-tertiary">Audit</span>
            <span className="text-primary sm:text-right">
              Sign-ins, MFA changes, and sensitive actions are logged for the organization.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
