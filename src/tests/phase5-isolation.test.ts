/**
 * Phase 5 — my-activity org isolation + jobs ledger permission.
 */
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { test } from "node:test";

const hasDb = !!process.env.DATABASE_URL;

test(
  "phase-5 activity isolation",
  { skip: !hasDb && "DATABASE_URL not set — integration suite skipped" },
  async () => {
    const { db, pool } = await import("@/lib/db");
    const schema = await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");
    const { provisionOrganization } = await import("@/modules/org/service");
    const { createSession, loadAuthContext } = await import("@/lib/session");
    const { audit } = await import("@/lib/audit");
    const activity = await import("@/modules/activity/service");
    const jobs = await import("@/modules/platform/jobs");
    const { ApiError } = await import("@/lib/errors");

    const suffix = `p5-${Date.now().toString(36)}`;
    const orgIds: string[] = [];
    const userIds: string[] = [];
    const passwordHash = await hashPassword("Iso-Test-Password-1!");

    try {
      const A = await provisionOrganization({
        companyName: `P5 Iso A ${suffix}`,
        adminName: "Admin A",
        adminEmail: `p5-admin-a-${suffix}@iso.test`,
        adminPasswordHash: passwordHash,
      });
      const B = await provisionOrganization({
        companyName: `P5 Iso B ${suffix}`,
        adminName: "Admin B",
        adminEmail: `p5-admin-b-${suffix}@iso.test`,
        adminPasswordHash: passwordHash,
      });
      orgIds.push(A.orgId, B.orgId);
      userIds.push(A.userId, B.userId);

      await audit({
        organizationId: A.orgId,
        actorUserId: A.userId,
        action: "USER_LOGIN",
        entityType: "session",
      });
      await audit({
        organizationId: B.orgId,
        actorUserId: B.userId,
        action: "USER_LOGIN",
        entityType: "session",
      });

      const ctxA = await loadAuthContext((await createSession(A.userId, {})).token);
      const ctxB = await loadAuthContext((await createSession(B.userId, {})).token);
      const mine = await activity.listMyActivity(ctxA, 100);
      assert.ok(mine.some((r) => r.action === "USER_LOGIN"));
      assert.equal(
        mine.every((r) => r.label.length > 0),
        true,
      );
      const leaked = mine.filter((r) => r.id && false);
      void leaked;
      const bRows = await activity.listMyActivity(ctxB, 100);
      const aIds = new Set(mine.map((r) => r.id));
      assert.equal(bRows.some((r) => aIds.has(r.id)), false, "B must not see A's activity ids");

      await assert.rejects(
        () => jobs.listJobLedger(ctxA),
        (e: unknown) => e instanceof ApiError && e.status === 403,
        "tenant admin cannot read the jobs ledger",
      );

      console.log("phase-5 isolation passed: activity A≠B, jobs 403");
    } finally {
      if (userIds.length) {
        await db.delete(schema.users).where(inArray(schema.users.id, userIds));
      }
      if (orgIds.length) {
        await db.delete(schema.organizations).where(inArray(schema.organizations.id, orgIds));
      }
      await pool.end();
    }
  },
);
