/**
 * Cross-tenant isolation tests (blueprint §1R — release-blocking).
 *
 * Provisions TWO tenants through the real provisioning service, creates REAL
 * sessions via loadAuthContext, then asserts zero leakage across directory,
 * attendance, leave review, search, overrides and admin operations.
 *
 * Requires a database: set DATABASE_URL, then `npm run test:integration`.
 * Auto-skips without DATABASE_URL so `npm test` stays hermetic.
 * Creates and deletes its own throwaway tenants — never touch real data.
 */
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { test } from "node:test";

const hasDb = !!process.env.DATABASE_URL;

test(
  "cross-tenant isolation",
  { skip: !hasDb && "DATABASE_URL not set — integration suite skipped" },
  async () => {
    // late-import everything DB-bound so the module can load without env
    const { db, pool } = await import("@/lib/db");
    const schema = await import("@/db/schema");
    const { hashPassword } = await import("@/lib/password");
    const ApiError = (await import("@/lib/errors")).ApiError;
    const { provisionOrganization } = await import("@/modules/org/service");
    const { createSession, loadAuthContext } = await import("@/lib/session");
    const peopleSvc = await import("@/modules/people/service");
    const attSvc = await import("@/modules/attendance/service");
    const leaveSvc = await import("@/modules/leave/service");
    const searchSvc = await import("@/modules/search/service");
    const adminSvc = await import("@/modules/admin/service");

    const suffix = Date.now().toString(36);
    const orgIds: string[] = [];
    const userIds: string[] = [];
    const passwordHash = await hashPassword("Iso-Test-Password-1!");

    async function makeTenant(tag: "a" | "b") {
      const { orgId, userId: adminId } = await provisionOrganization({
        companyName: `Iso Test ${tag.toUpperCase()} ${suffix}`,
        adminName: `Admin ${tag}`,
        adminEmail: `admin-${tag}-${suffix}@iso.test`,
        adminPasswordHash: passwordHash,
      });
      orgIds.push(orgId);
      userIds.push(adminId);

      async function addUser(name: string, roleKey: string): Promise<string> {
        const [u] = await db
          .insert(schema.users)
          .values({
            organizationId: orgId,
            email: `${name.toLowerCase()}-${tag}-${suffix}@iso.test`,
            name: `${name} ${tag.toUpperCase()}`,
            passwordHash,
            status: "active",
          })
          .returning({ id: schema.users.id });
        userIds.push(u!.id);
        // role keys are unique per tenant; system roles exist in both tenants,
        // so scope the lookup to this org to prove we bind the right tenant's role
        const [roleRow] = await db
          .select({ id: schema.roles.id })
          .from(schema.roles)
          .where(and(eq(schema.roles.organizationId, orgId), eq(schema.roles.key, roleKey)))
          .limit(1);
        assert.ok(roleRow, `role ${roleKey} must exist in tenant ${tag}`);
        await db.insert(schema.userRoles).values({ userId: u!.id, roleId: roleRow.id });
        return u!.id;
      }

      const managerId = await addUser("Manager", "manager");
      const employeeId = await addUser("Employee", "employee");

      // employee records + reporting line
      for (const [uid, title, manager] of [
        [managerId, `${tag}-manager`, null],
        [employeeId, `${tag}-employee`, managerId],
      ] as const) {
        await db.insert(schema.employees).values({
          organizationId: orgId,
          userId: uid,
          jobTitle: title,
          managerUserId: manager,
        });
      }
      return { orgId, adminId, managerId, employeeId };
    }

    async function ctxFor(userId: string) {
      const session = await createSession(userId, {});
      return loadAuthContext(session.token);
    }

    try {
      const A = await makeTenant("a");
      const B = await makeTenant("b");

      // leave type only in tenant A
      const [leaveTypeA] = await db
        .insert(schema.leaveTypes)
        .values({ organizationId: A.orgId, name: "Annual", annualQuotaDays: "10" })
        .returning({ id: schema.leaveTypes.id });

      const ctxEmpA = await ctxFor(A.employeeId);
      const ctxMgrA = await ctxFor(A.managerId);
      const ctxMgrB = await ctxFor(B.managerId);

      // --- directory isolation ---
      const dirA = await peopleSvc.listDirectory(ctxMgrA);
      assert.ok(dirA.some((p) => p.userId === A.employeeId), "mgr A sees own team");
      assert.ok(
        !dirA.some((p) => p.email.includes(`-b-${suffix}@`)),
        "directory of A must not contain B users",
      );

      // --- attendance isolation ---
      await attSvc.clockToggle(ctxEmpA);
      // B's manager has TEAM scope: sees only own reports + self, never A's people
      const visibleToB = await attSvc.listVisible(ctxMgrB);
      assert.equal(visibleToB.length, 0, "fresh tenant B has no attendance rows at all");
      const visibleToA = await attSvc.listVisible(ctxMgrA);
      assert.ok(
        visibleToA.some((r) => r.userId === A.employeeId && !r.clockOut),
        "mgr A sees employee A's open shift",
      );

      // --- leave isolation: request in A, approval attempt from B ---
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const dayAfter = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      const req = await leaveSvc.apply(ctxEmpA, {
        leaveTypeId: leaveTypeA!.id,
        startDate: tomorrow,
        endDate: dayAfter,
      });

      // B's manager cannot even see it
      assert.equal((await leaveSvc.pendingForApprover(ctxMgrB)).length, 0);

      // B's manager cannot review it
      await assert.rejects(
        () => leaveSvc.review(ctxMgrB, req.id, "approved"),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "cross-tenant review must fail as not-found",
      );

      // own manager CAN approve → balance increments
      await leaveSvc.review(ctxMgrA, req.id, "approved");
      const balA = await leaveSvc.myBalances(ctxEmpA);
      const annual = balA.find((b) => b.leaveTypeId === leaveTypeA!.id);
      assert.equal(Number(annual?.usedDays ?? 0), 2, "approved days deducted in A");

      // --- search isolation ---
      const hitsA = await searchSvc.search(ctxMgrA, "employee");
      assert.ok(
        hitsA.length > 0 && hitsA.every((h) => h.subtitle.includes("a-employee")),
        "A search returns only A people",
      );
      const hitsB = await searchSvc.search(ctxMgrB, "employee");
      assert.ok(!hitsB.some((h) => h.subtitle.includes("a-employee")), "B search finds no A person");

      // --- admin ops isolation ---
      const ctxAdminB = await ctxFor(B.adminId);
      await assert.rejects(
        async () =>
          adminSvc.assignRole(
            ctxAdminB,
            A.employeeId, // user from tenant A
            (
              await db
                .select({ id: schema.roles.id })
                .from(schema.roles)
                .where(eq(schema.roles.organizationId, B.orgId))
                .limit(1)
            )[0]!.id,
          ),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "B admin cannot modify A user",
      );

      // --- override honored end-to-end within tenant ---
      const ctxAdminA = await ctxFor(A.adminId);
      await adminSvc.addOverride(ctxAdminA, {
        userId: A.employeeId,
        permission: "audit.view",
        effect: "allow",
        scope: "COMPANY",
        reason: "iso-test grant",
      });
      const ctxEmpA2 = await ctxFor(A.employeeId); // fresh context reloads access
      assert.ok(ctxEmpA2.access.allowed.has("audit.view"), "override grants after reload");

      // deny beats role grant
      await adminSvc.addOverride(ctxAdminA, {
        userId: A.employeeId,
        permission: "employees.view",
        effect: "deny",
        scope: "COMPANY",
        reason: "iso-test deny",
      });
      const ctxEmpA3 = await ctxFor(A.employeeId);
      assert.equal(await (async () => {
        const { can } = await import("@/modules/iam/engine");
        return can(ctxEmpA3.access, "employees.view");
      })(), false, "explicit deny removes role-granted permission");

      // --- generic requests isolation ---
      const reqSvc = await import("@/modules/requests/service");
      const insertedType = await db
        .insert(schema.requestTypes)
        .values({
          organizationId: A.orgId,
          key: `iso-${suffix}`,
          name: "Iso Request",
          fields: [{ key: "detail", label: "Detail", type: "text", required: true }],
          approverMode: "manager",
        })
        .returning({ id: schema.requestTypes.id });

      const genReq = await reqSvc.apply(ctxEmpA2, {
        typeId: insertedType[0]!.id,
        payload: { detail: "cross-tenant probe" },
      });
      assert.equal((await reqSvc.pendingForApprover(ctxMgrB)).length, 0, "B sees no A requests");
      await assert.rejects(
        () => reqSvc.review(ctxMgrB, genReq.id, "approved"),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "cross-tenant request review must fail as not-found",
      );
      await reqSvc.review(ctxMgrA, genReq.id, "approved"); // own manager fine

      // --- documents isolation ---
      const docsSvc = await import("@/modules/documents/service");
      await docsSvc.upload(
        ctxAdminA,
        { name: `a-secret-${suffix}.txt`, mimeType: "text/plain", data: Buffer.from("tenant A secret") },
        { category: "company" },
      );
      const docsB = await docsSvc.listVisible(ctxAdminB);
      assert.ok(
        !docsB.some((d) => d.fileName.includes(suffix)),
        "B document list must not contain A files",
      );
      const [docA] = await db
        .select({ id: schema.documents.id })
        .from(schema.documents)
        .where(eq(schema.documents.organizationId, A.orgId))
        .limit(1);
      await assert.rejects(
        () => docsSvc.getForDownload(ctxMgrB, docA!.id),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "cross-tenant download must fail as not-found",
      );

      // --- knowledge isolation ---
      const knowSvc = await import("@/modules/knowledge/service");
      const art = await knowSvc.create(ctxAdminA, {
        title: `A-only handbook ${suffix}`,
        body: "internal process details",
      });
      const artsB = await knowSvc.list(ctxAdminB);
      assert.ok(!artsB.some((a) => a.title.includes(suffix)), "B must not see A articles");
      const artsA = await knowSvc.list(ctxAdminA);
      assert.ok(artsA.some((a) => a.title.includes(suffix)), "A sees its own article");
      await knowSvc.remove(ctxAdminA, art.id);

      // --- analytics scoping ---
      const analytics = await import("@/modules/analytics/service");
      const overviewB = await analytics.overview(await ctxFor(B.adminId));
      // r13+: provisioning seeds a directory row for the founder-admin too (3 = admin + manager + employee)
      assert.ok(overviewB && overviewB.headcount === 3, "B company overview counts only B members incl. admin");
      const overviewMgrA = await analytics.overview(ctxMgrA);
      assert.ok(overviewMgrA && overviewMgrA.scope === "team", "manager gets team-scoped view");

      // --- work module scoping ---
      const workSvc = await import("@/modules/work/service");
      await workSvc.createTask(ctxEmpA2, { title: `iso-task-${suffix}` });
      const teamTasksB = await workSvc.listTeamTasks(ctxMgrB);
      assert.ok(
        !teamTasksB.some((t) => t.title.includes(suffix)),
        "B team task list must not contain A tasks",
      );
      const mineA = await workSvc.listMyTasks(ctxEmpA2);
      assert.ok(mineA.some((t) => t.title.includes(suffix)), "assignee sees own task");

      // --- D9 admin surfaces are tenant-scoped ---
      // B admin cannot read A user detail
      await assert.rejects(
        () => adminSvc.getUserDetail(ctxAdminB, A.employeeId),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "B admin cannot open A user detail",
      );
      // B admin cannot suspend A user
      await assert.rejects(
        () => adminSvc.setUserStatus(ctxAdminB, A.employeeId, "suspended"),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "B admin cannot suspend A user",
      );
      // sessions listing only shows own org's users
      const orgSessionsA = await adminSvc.listOrgSessions(ctxAdminA);
      assert.ok(orgSessionsA.length > 0 && orgSessionsA.every((s) => s.userId !== B.adminId), "org sessions contain no B users");
      const orgSessionsB = await adminSvc.listOrgSessions(ctxAdminB);
      assert.ok(!orgSessionsB.some((s) => s.userId === A.adminId), "B session table must not contain A users");
      // B admin cannot revoke a session belonging to an A user — find one of A's sessions first
      if (orgSessionsA.length > 0) {
        await assert.rejects(
          () => adminSvc.revokeSession(ctxAdminB, orgSessionsA[0]!.id),
          (e: unknown) => e instanceof ApiError && e.status === 404,
          "cross-tenant session revocation must fail as not-found",
        );
      }
      // audit trail is org-scoped both ways
      const auditA = await adminSvc.listAuditLogs(ctxAdminA, { limit: 200 });
      assert.ok(auditA.every((a) => !String(a.entityId ?? "").includes(`-b-${suffix}`)), "A audit has no B entity ids");
      const auditB = await adminSvc.listAuditLogs(ctxAdminB, { limit: 200 });
      assert.ok(auditB.every((a) => a.actorName === null || !auditA.some((x) => x.id === a.id)), "B audit rows never mirror A audit ids");

      // --- support tickets scoping ---
      const ticketsSvc = await import("@/modules/tickets/service");
      await ticketsSvc.createTicket(ctxEmpA2, {
        title: `iso-ticket-${suffix}`,
        description: "only for A",
      });
      const ticketsB = await ticketsSvc.listTickets(ctxAdminB);
      assert.ok(
        !ticketsB.some((t) => t.title.includes(suffix)),
        "B ticket list must not contain A tickets",
      );

      // --- announcements scoping ---
      const annSvc = await import("@/modules/announcements/service");
      await annSvc.create(ctxAdminA, {
        title: `iso-ann-${suffix}`,
        body: "A-only announcement",
      });
      const annsB = await annSvc.listRecent(ctxAdminB);
      assert.ok(!annsB.some((a) => a.title.includes(suffix)), "B must not see A announcements");

      console.log("isolation suite passed: directory/attendance/leave/search/admin/overrides/requests/documents/knowledge/analytics/work/admin-detail/admin-sessions/admin-audit/tickets/announcements all tenant-scoped");
    } finally {
      // cleanup test tenants (users first — FK default is restrict)
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
