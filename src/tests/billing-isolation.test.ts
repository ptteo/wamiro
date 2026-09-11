/**
 * Phase 3 billing isolation — webhook replay, cross-tenant apply, soft vs
 * hard seats, dunning stages. Throwaway tenants only.
 *
 * Requires DATABASE_URL. `npm test` stays hermetic; this file is in
 * `test:integration`.
 */
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";

const hasDb = !!process.env.DATABASE_URL;

test(
  "phase-3 billing isolation",
  { skip: !hasDb && "DATABASE_URL not set — integration suite skipped" },
  async () => {
    const { db, pool } = await import("@/lib/db");
    const schema = await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");
    const { provisionOrganization } = await import("@/modules/org/service");
    const { createSession, loadAuthContext } = await import("@/lib/session");
    const adminSvc = await import("@/modules/admin/service");
    const billingSvc = await import("@/modules/billing/service");
    const billingWebhook = await import("@/modules/billing/webhook");
    const billingDunning = await import("@/modules/billing/dunning");

    const suffix = `b3-${Date.now().toString(36)}`;
    const orgIds: string[] = [];
    const userIds: string[] = [];
    const passwordHash = await hashPassword("Iso-Test-Password-1!");

    async function makeTenant(tag: "a" | "b") {
      const { orgId, userId: adminId } = await provisionOrganization({
        companyName: `Bill Iso ${tag.toUpperCase()} ${suffix}`,
        adminName: `Admin ${tag}`,
        adminEmail: `bill-admin-${tag}-${suffix}@iso.test`,
        adminPasswordHash: passwordHash,
      });
      orgIds.push(orgId);
      userIds.push(adminId);
      return { orgId, adminId };
    }

    async function ctxFor(userId: string) {
      const session = await createSession(userId, {});
      return loadAuthContext(session.token);
    }

    try {
      const A = await makeTenant("a");
      const B = await makeTenant("b");
      const ctxAdminA = await ctxFor(A.adminId);

      const evtA = `evt-bill-a-${suffix}`;
      const firstApply = await billingWebhook.applyPaddleEvent({
        event_id: evtA,
        event_type: "subscription.activated",
        data: {
          id: `sub_bill_${suffix}`,
          status: "active",
          customer_id: `ctm_bill_${suffix}`,
          custom_data: { organizationId: A.orgId },
        },
      });
      assert.equal(firstApply.replay, false);
      assert.equal(firstApply.orgId, A.orgId);
      const snapA = await billingWebhook.orgBillingSnapshot(A.orgId);
      assert.equal(snapA?.billingStatus, "active");
      assert.equal(snapA?.billingProvider, "paddle");
      assert.equal(snapA?.billingCustomerId, `ctm_bill_${suffix}`);
      assert.equal(snapA?.billingSubscriptionId, `sub_bill_${suffix}`);

      const replay = await billingWebhook.applyPaddleEvent({
        event_id: evtA,
        event_type: "subscription.canceled",
        data: {
          id: `sub_bill_${suffix}`,
          status: "canceled",
          custom_data: { organizationId: A.orgId },
        },
      });
      assert.equal(replay.replay, true, "same event_id is a no-op");
      assert.equal((await billingWebhook.orgBillingSnapshot(A.orgId))?.billingStatus, "active", "replay must not re-apply");

      const snapBBefore = await billingWebhook.orgBillingSnapshot(B.orgId);
      await billingWebhook.applyPaddleEvent({
        event_id: `evt-bill-a2-${suffix}`,
        event_type: "subscription.canceled",
        data: {
          id: `sub_bill_${suffix}`,
          status: "canceled",
          custom_data: { organizationId: A.orgId },
        },
      });
      assert.equal((await billingWebhook.orgBillingSnapshot(A.orgId))?.billingStatus, "cancelled");
      assert.equal(
        (await billingWebhook.orgBillingSnapshot(B.orgId))?.billingStatus,
        snapBBefore?.billingStatus,
        "event for A never mutates B",
      );

      const invBeforeB = await billingWebhook.invoiceCountForOrg(B.orgId);
      await billingWebhook.applyPaddleEvent({
        event_id: `evt-bill-txn-a-${suffix}`,
        event_type: "transaction.completed",
        data: {
          id: `txn_bill_${suffix}`,
          invoice_id: `inv_bill_${suffix}`,
          status: "completed",
          currency_code: "USD",
          customer_id: `ctm_bill_${suffix}`,
          subscription_id: `sub_bill_${suffix}`,
          custom_data: { organizationId: A.orgId },
          details: { totals: { grand_total: "4000" } },
        },
      });
      assert.ok((await billingWebhook.invoiceCountForOrg(A.orgId)) >= 1, "invoice stored on A");
      assert.equal(await billingWebhook.invoiceCountForOrg(B.orgId), invBeforeB, "invoice for A is not visible on B");

      await db
        .update(schema.organizations)
        .set({ billingStatus: "active", billingProvider: "paddle", dunningStage: 0 })
        .where(eq(schema.organizations.id, A.orgId));

      const viewSoft = await billingSvc.subscriptionView(ctxAdminA);
      await db
        .update(schema.organizations)
        .set({ seatLimit: viewSoft.activeSeats, seatOveragePolicy: "soft" })
        .where(eq(schema.organizations.id, A.orgId));
      const softInvite = await adminSvc.inviteUser(ctxAdminA, {
        name: "Soft Overflow",
        email: `bill-soft-${suffix}@iso.test`,
        roleKey: "employee",
      });
      userIds.push(softInvite.userId);
      assert.ok(softInvite.userId, "soft cap allows invite at the seat limit");
      await db
        .update(schema.organizations)
        .set({ seatOveragePolicy: "hard", seatLimit: viewSoft.activeSeats })
        .where(eq(schema.organizations.id, A.orgId));
      await assert.rejects(
        () =>
          adminSvc.inviteUser(ctxAdminA, {
            name: "Hard Overflow",
            email: `bill-hard-${suffix}@iso.test`,
            roleKey: "employee",
          }),
        /plan allows up to/i,
        "hard cap still rejects at the limit",
      );

      await db
        .update(schema.organizations)
        .set({
          billingStatus: "past_due",
          billingStatusChangedAt: new Date(Date.now() - 2 * 86_400_000),
          dunningStage: 0,
        })
        .where(eq(schema.organizations.id, A.orgId));
      const d1 = await billingDunning.sweepDunning(new Date(), A.orgId);
      assert.ok(d1.advanced >= 1, "day-1 dunning advances the stage");
      assert.equal((await billingWebhook.orgBillingSnapshot(A.orgId))?.dunningStage, 1);
      await billingDunning.sweepDunning(new Date(), A.orgId);
      assert.equal((await billingWebhook.orgBillingSnapshot(A.orgId))?.dunningStage, 1, "second sweep is idempotent");
      await db
        .update(schema.organizations)
        .set({ billingStatusChangedAt: new Date(Date.now() - 8 * 86_400_000) })
        .where(eq(schema.organizations.id, A.orgId));
      await billingDunning.sweepDunning(new Date(), A.orgId);
      assert.equal((await billingWebhook.orgBillingSnapshot(A.orgId))?.dunningStage, 7, "day-7 notice is the last stage");

      console.log("phase-3 billing isolation passed: webhook replay, A≠B, invoices, soft/hard seats, dunning");
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
