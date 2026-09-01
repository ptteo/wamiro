import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { leaveTypes } from "@/db/schema";
import { myBalances } from "@/modules/leave/service";

/**
 * Types + current-year balances in one payload. Fresh tenants have types but
 * no balance rows yet — derive entitled from the type's annual quota so the
 * employee sees their leave entitlement before the first request.
 */
export const GET = route(
  async (_req, { auth }) => {
    const [types, balances] = await Promise.all([
      db
        .select({ id: leaveTypes.id, name: leaveTypes.name, annualQuotaDays: leaveTypes.annualQuotaDays, paid: leaveTypes.paid })
        .from(leaveTypes)
        .where(eq(leaveTypes.organizationId, auth.user.organizationId)),
      myBalances(auth),
    ]);
    const byType = new Map(balances.map((b) => [b.leaveTypeId, b]));
    return NextResponse.json({
      balances: types.map((t: (typeof types)[number] & { annualQuotaDays?: unknown; paid?: boolean }) => {
        const b = byType.get(t.id);
        const entitled = Number(b?.entitledDays ?? t.annualQuotaDays ?? 0);
        const used = Number(b?.usedDays ?? 0);
        return {
          leaveTypeId: t.id,
          name: t.name,
          entitledDays: entitled,
          usedDays: used,
          remainingDays: entitled - used,
          paid: t.paid ?? true,
        };
      }),
    });
  },
  { permission: "leave.view_self" },
);
