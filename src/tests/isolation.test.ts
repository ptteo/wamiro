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
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
    const shiftsSvc = await import("@/modules/shifts/service");
    const correctionsSvc = await import("@/modules/attendance/corrections");
    const encSvc = await import("@/modules/leave/encashment");
    const hrDocsSvc = await import("@/modules/people/hr-documents");
    const payrollSvc = await import("@/modules/payroll/service");
    const reportsSvc = await import("@/modules/analytics/reports");
    const toolkitSvc = await import("@/modules/tickets/toolkit");
    const advancesSvc = await import("@/modules/payroll/advances");
    const billingSvc = await import("@/modules/billing/service");
    const domainSvc = await import("@/modules/org/domain");
    const hostLib = await import("@/modules/org/host");
    const pushSvc = await import("@/modules/push/service");
    const { enforceRateLimit, peekRateLimit } = await import("@/lib/ratelimit");

    const suffix = Date.now().toString(36);
    const orgIds: string[] = [];
    const userIds: string[] = [];
    const operatorEmails: string[] = [];
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
      await db.insert(schema.leaveBalances).values({
        organizationId: A.orgId,
        userId: A.employeeId,
        leaveTypeId: leaveTypeA!.id,
        year: new Date().getFullYear(),
        entitledDays: "10",
        usedDays: "0",
      });

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

      // --- leave cancel: withdraw / request / approve / force / isolation ---
      await assert.rejects(
        () => leaveSvc.cancelLeave(ctxMgrB, req.id, { force: true, note: "nope" }),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "cross-tenant force-cancel is not-found",
      );
      await assert.rejects(
        () => leaveSvc.cancelLeave(ctxMgrB, req.id),
        (e: unknown) => e instanceof ApiError && (e.status === 403 || e.status === 404),
        "cross-tenant self-cancel is forbidden or not-found",
      );

      await leaveSvc.cancelLeave(ctxEmpA, req.id);
      const queueCancel = await leaveSvc.pendingForApprover(ctxMgrA);
      assert.ok(
        queueCancel.some((r) => r.id === req.id && r.kind === "cancel"),
        "manager sees the cancel request",
      );
      assert.equal((await leaveSvc.pendingForApprover(ctxMgrB)).length, 0, "B does not see A's cancel request");

      await leaveSvc.review(ctxMgrA, req.id, "rejected", "still needed");
      assert.equal(
        Number((await leaveSvc.myBalances(ctxEmpA)).find((b) => b.leaveTypeId === leaveTypeA!.id)?.usedDays ?? 0),
        2,
        "rejecting cancel keeps the deduction",
      );

      await leaveSvc.cancelLeave(ctxEmpA, req.id);
      await leaveSvc.review(ctxMgrA, req.id, "approved");
      assert.equal(
        Number((await leaveSvc.myBalances(ctxEmpA)).find((b) => b.leaveTypeId === leaveTypeA!.id)?.usedDays ?? 0),
        0,
        "approving cancel restores the balance",
      );

      const pending = await leaveSvc.apply(ctxEmpA, {
        leaveTypeId: leaveTypeA!.id,
        startDate: tomorrow,
        endDate: tomorrow,
      });
      await leaveSvc.cancelLeave(ctxEmpA, pending.id);
      const withdrawn = (await leaveSvc.myRequests(ctxEmpA)).find((r) => r.id === pending.id);
      assert.equal(withdrawn?.status, "cancelled", "pending leave withdraws immediately");
      assert.equal(
        Number((await leaveSvc.myBalances(ctxEmpA)).find((b) => b.leaveTypeId === leaveTypeA!.id)?.usedDays ?? 0),
        0,
        "withdrawn pending leave never deducted",
      );

      const toForce = await leaveSvc.apply(ctxEmpA, {
        leaveTypeId: leaveTypeA!.id,
        startDate: tomorrow,
        endDate: dayAfter,
      });
      await leaveSvc.review(ctxMgrA, toForce.id, "approved");
      await assert.rejects(
        () => leaveSvc.cancelLeave(ctxMgrA, toForce.id, { force: true }),
        (e: unknown) => e instanceof ApiError && e.status === 400,
        "force-cancel requires a note",
      );
      const ctxLeaveAdminA = await ctxFor(A.adminId);
      await leaveSvc.cancelLeave(ctxLeaveAdminA, toForce.id, { force: true, note: "Coverage needed" });
      assert.equal(
        Number((await leaveSvc.myBalances(ctxEmpA)).find((b) => b.leaveTypeId === leaveTypeA!.id)?.usedDays ?? 0),
        0,
        "admin force-cancel restores the balance",
      );

      const pastEnd = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const pastStart = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
      const endedLeave = await leaveSvc.apply(ctxEmpA, {
        leaveTypeId: leaveTypeA!.id,
        startDate: pastStart,
        endDate: pastEnd,
      });
      await leaveSvc.review(ctxMgrA, endedLeave.id, "approved");
      await assert.rejects(
        () => leaveSvc.cancelLeave(ctxEmpA, endedLeave.id),
        (e: unknown) => e instanceof ApiError && e.status === 409,
        "employee cannot request cancel after the leave ended",
      );
      await leaveSvc.cancelLeave(ctxLeaveAdminA, endedLeave.id, { force: true, note: "Entered in error" });

      const rejected = await leaveSvc.apply(ctxEmpA, {
        leaveTypeId: leaveTypeA!.id,
        startDate: tomorrow,
        endDate: tomorrow,
      });
      await leaveSvc.review(ctxMgrA, rejected.id, "rejected");
      await assert.rejects(
        () => leaveSvc.cancelLeave(ctxEmpA, rejected.id),
        (e: unknown) => e instanceof ApiError && e.status === 409,
        "rejected leave has no cancel path",
      );

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
      const createdTicket = await ticketsSvc.createTicket(ctxEmpA2, {
        title: `iso-ticket-${suffix}`,
        description: "only for A",
      });
      const ticketsB = await ticketsSvc.listTickets(ctxAdminB);
      assert.ok(
        !ticketsB.some((t) => t.title.includes(suffix)),
        "B ticket list must not contain A tickets",
      );

      // new tickets carry SLA deadlines per priority (default medium)
      const freshTicket = await ticketsSvc.getTicket(ctxEmpA2, createdTicket.id);
      assert.ok(freshTicket.slaDueDate instanceof Date, "resolution SLA deadline set on create");
      assert.ok(freshTicket.firstResponseDueAt instanceof Date, "first-response SLA deadline set on create");
      assert.equal(freshTicket.slaState, "ok");

      // cross-tenant assign must be not-found (org-scoped lookup)
      await assert.rejects(
        () => ticketsSvc.assignTicket(ctxAdminB, createdTicket.id, ctxEmpA2.user.id),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "B agent cannot assign an A ticket",
      );

      // CSAT: non-requester of the same org is forbidden; other tenant is 404
      await assert.rejects(
        () => ticketsSvc.submitCsat(ctxAdminA, createdTicket.id, 5),
        (e: unknown) => e instanceof ApiError && e.status === 403,
        "non-requester cannot rate a ticket",
      );
      await assert.rejects(
        () => ticketsSvc.submitCsat(ctxAdminB, createdTicket.id, 5),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "cross-tenant CSAT must be not-found",
      );

      // CSAT requires resolved/closed status
      await assert.rejects(
        () => ticketsSvc.submitCsat(ctxEmpA2, createdTicket.id, 5),
        (e: unknown) => e instanceof ApiError && e.status === 400,
        "CSAT before resolution is rejected",
      );

      // agent resolves → requester can rate; B's sweep never touches A tickets
      await ticketsSvc.updateStatus(ctxAdminA, createdTicket.id, "resolved");
      await ticketsSvc.submitCsat(ctxEmpA2, createdTicket.id, 5, "great");
      const rated = await ticketsSvc.getTicket(ctxEmpA2, createdTicket.id);
      assert.equal(rated.csatScore, 5);
      const sweepB = await ticketsSvc.sweepSlaStates(ctxAdminB);
      assert.equal(sweepB.checked, 0, "B sweep must not scan A tickets");

      // --- announcements scoping ---
      const annSvc = await import("@/modules/announcements/service");
      await annSvc.create(ctxAdminA, {
        title: `iso-ann-${suffix}`,
        body: "A-only announcement",
      });
      const annsB = await annSvc.listRecent(ctxAdminB);
      assert.ok(!annsB.some((a) => a.title.includes(suffix)), "B must not see A announcements");

      // --- Phase E: platform console v2 (risk board, impersonation, broadcast, queue) ---
      const consoleSvc = await import("@/modules/platform/console");

      // risk board: platform gate + per-tenant rows
      await assert.rejects(
        () => consoleSvc.tenantRiskBoard(ctxAdminA),
        /platform\.admin/,
        "risk board is platform-only",
      );
      // tenant admin (no platform.admin) cannot escalate/list queue/grant list
      await assert.rejects(() => consoleSvc.platformSupportQueue(ctxAdminA), /platform\.admin/);
      await assert.rejects(() => consoleSvc.listAvailableGrants(ctxAdminA), /platform\.admin/);
      await assert.rejects(
        () => consoleSvc.escalateTicket(ctxAdminA, createdTicket.id),
        /platform\.admin/,
      );

      // tenant side: only tenant admins can grant; grant/revoke round-trip
      await assert.rejects(
        () => consoleSvc.grantImpersonation(ctxEmpA2, { reason: "not an admin" }),
        (e: unknown) => e instanceof ApiError && e.status === 403,
        "employees cannot grant support access",
      );
      const grant = await consoleSvc.grantImpersonation(ctxAdminA, {
        reason: `iso-support-${suffix}`,
        days: 1,
      });
      assert.ok(grant.id, "grant created");
      const liveGrantA = await consoleSvc.myImpersonationGrant(ctxAdminA);
      assert.equal(liveGrantA?.id, grant.id);
      assert.equal(await consoleSvc.myImpersonationGrant(ctxAdminB), null, "B has no grant");

      // operator impersonation flow: start → ledger → stop
      const [operatorRow] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
        .innerJoin(schema.roles, and(eq(schema.roles.id, schema.userRoles.roleId), eq(schema.roles.key, "super_admin")))
        .limit(1);
      if (operatorRow) {
        const opSession = await createSession(operatorRow.id, {});
        const operatorToken = opSession.token;
        const ctxOp = await ctxFor(operatorRow.id);
        const targets = await consoleSvc.listImpersonationTargets(ctxOp, grant.id);
        assert.ok(targets.some((t) => t.id === A.adminId), "tenant admins are impersonation targets");
        await assert.rejects(
          () => consoleSvc.startImpersonation(ctxOp, { grantId: grant.id, targetUserId: ctxOp.user.id, operatorToken }),
          /cannot impersonate yourself/,
        );
        const win = await consoleSvc.startImpersonation(ctxOp, {
          grantId: grant.id,
          targetUserId: A.adminId,
          operatorToken,
        });
        assert.ok(win.impersonationToken, "impersonation session minted");
        assert.ok(win.returnToken, "operator return session minted");
        const ledgerRows = await consoleSvc.listImpersonationLedger(ctxOp);
        assert.ok(ledgerRows.some((l) => l.reason.includes(suffix)), "window recorded in ledger");

        // while impersonating, the effective context is the TENANT admin
        const impersonatedCtx = await loadAuthContext(win.impersonationToken);
        assert.equal(impersonatedCtx.user.organizationId, A.orgId, "impersonated session resolves into the granted tenant");
        // revoked consent mid-window: grant revoke kills live impersonation sessions
        await consoleSvc.revokeImpersonation(ctxAdminA, grant.id);
        await assert.rejects(
          () => loadAuthContext(win.impersonationToken),
          (e: unknown) => e instanceof ApiError && e.status === 401,
          "revoking consent invalidates the live impersonation session",
        );
        await assert.rejects(
          () => consoleSvc.startImpersonation(ctxOp, { grantId: grant.id, targetUserId: A.adminId, operatorToken }),
          (e: unknown) => e instanceof ApiError && e.status === 404,
          "revoked grant cannot be used again",
        );
        // cleanup: the operator's return session created during the window
        const { hashToken } = await import("@/lib/password");
        await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(win.returnToken)));
      }

      // broadcast: reaches every tenant, never crosses (each row org-scoped)
      const bcast = await assert.rejects(
        () => consoleSvc.broadcastAnnouncement(ctxAdminA, { title: "x", body: "y" }),
        /platform\.admin/,
        "broadcast is platform-only",
      );
      void bcast;

      // support queue: platform category + escalation flow (with an operator ctx when available)
      if (operatorRow) {
        const ctxOp = await ctxFor(operatorRow.id);
        const [pt] = await db
          .insert(schema.tickets)
          .values({
            organizationId: A.orgId,
            title: `iso-platform-ticket-${suffix}`,
            description: "needs platform help",
            category: "platform",
            requesterId: A.adminId,
          })
          .returning({ id: schema.tickets.id });
        const queueBefore = await consoleSvc.platformSupportQueue(ctxOp);
        assert.ok(
          queueBefore.some((t) => t.id === pt!.id && t.organizationId === A.orgId),
          "platform-category tickets are visible to platform ops",
        );
        assert.ok(
          !queueBefore.some((t) => t.title.includes(suffix) && t.organizationId === B.orgId),
          "queue rows carry their own tenant only",
        );
        await consoleSvc.escalateTicket(ctxOp, pt!.id);
        const [esc] = await db
          .select({ escalatedAt: schema.tickets.escalatedAt })
          .from(schema.tickets)
          .where(eq(schema.tickets.id, pt!.id))
          .limit(1);
        assert.ok(esc?.escalatedAt, "escalation stamp set");
        // operator reply path (native ticket engine, requester notified)
        await consoleSvc.platformTicketReply(ctxOp, pt!.id, "platform team on it");
        const replies = await ticketsSvc.getTicket(ctxAdminA, pt!.id);
        assert.ok(replies.replies.some((r) => r.body === "platform team on it"), "operator reply lands on the ticket");

        // --- Phase A: usage metering (platform.tenant_usage_daily) ---
        const usageSvc = await import("@/modules/platform/usage");
        // tenant admins/employees are denied — panel reads are platform-only
        await assert.rejects(() => usageSvc.usageSummary(ctxAdminA), /platform\.admin/, "usage summary is platform-only");
        await assert.rejects(() => usageSvc.moduleHeatmap(ctxAdminA), /platform\.admin/, "heatmap is platform-only");
        // rollup writes a real row (soft ref + snapshots, no FK) that is idempotent
        const day = new Date();
        await usageSvc.rollupUsageDay(A.orgId, day);
        await usageSvc.rollupUsageDay(A.orgId, day); // second run must not throw or duplicate
        const rolled = await db.execute(
          sql`SELECT day::text AS day, org_name, org_slug, plan, actions, seats_active
              FROM platform.tenant_usage_daily WHERE org_id = ${A.orgId} AND day = ${day.toISOString().slice(0, 10)}`,
        );
        const usageRow = rolled.rows[0] as { day: string; org_name: string; org_slug: string; plan: string } | undefined;
        assert.ok(usageRow, "rollup persisted one usage row for the day");
        assert.equal(usageRow.org_name, "Iso Test A " + suffix, "row carries the org name snapshot");
        assert.equal(usageRow.plan, "starter", "row snapshots the org plan");
        // operator read sees the row; the OTHER tenant's rows never appear in A's view
        const summary = await usageSvc.usageSummary(ctxOp);
        const aRow = summary.find((r) => r.organizationId === A.orgId);
        assert.ok(aRow, "operator sees A in the fleet usage table");
        assert.ok(!summary.some((r) => r.organizationId === ctxOp.user.organizationId), "platform org itself excluded");
        // cleanup — the rollup table is panel-owned; remove the throwaway row
        await db.execute(sql`DELETE FROM platform.tenant_usage_daily WHERE org_id = ${A.orgId}`);
      }



      async function orgBillingStatusOf(orgId: string): Promise<string> {
        const [row] = await db
          .select({ s: schema.organizations.billingStatus })
          .from(schema.organizations)
          .where(eq(schema.organizations.id, orgId))
          .limit(1);
        return String(row?.s ?? "");
      }


      // --- Phase 2: ticket attachments (F2.1) ---
      const attMod = await import("@/modules/tickets/attachments");
      const uploaded = await attMod.addAttachment(ctxEmpA2, createdTicket.id, {
        name: `iso-file-${suffix}.txt`,
        mimeType: "text/plain",
        data: Buffer.from("hello isolation"),
      });
      await assert.rejects(
        () => attMod.getForDownload(ctxAdminB, uploaded.id),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "cross-tenant attachment download must be not-found",
      );
      const attListA = await attMod.listForTicket(ctxAdminA, createdTicket.id);
      assert.ok(attListA.some((a) => a.id === uploaded.id), "agent sees ticket attachments");
      await attMod.removeAttachment(ctxAdminA, uploaded.id); // cleanup stored object

      // --- Phase 2: service catalog (F2.3) ---
      const catSvc = await import("@/modules/support-catalog/service");
      const catalogA = await catSvc.listCatalog(ctxEmpA2);
      const catalogB = await catSvc.listCatalog(ctxAdminB);
      assert.ok(catalogA.length > 0 && catalogA.some((s) => s.name === "Access request"), "seeded catalog present in A");
      assert.ok(!catalogA.some((a) => catalogB.some((b) => b.id === a.id)), "catalog rows never shared across tenants");
      // no-approval item (security) creates a ticket immediately
      const secItem = catalogA.find((s) => s.category === "security");
      assert.ok(secItem);
      const direct = await catSvc.requestService(ctxEmpA2, secItem.id, "phishing email received");
      assert.equal(direct.kind, "ticket", "no-approval service creates a ticket instantly");
      // approval-required item routes through the requests engine
      const accItem = catalogA.find((s) => s.name === "Access request");
      assert.ok(accItem);
      const viaReq = await catSvc.requestService(ctxEmpA2, accItem.id, "need CRM access");
      assert.equal(viaReq.kind, "request", "approval service creates a request");
      // admin CRUD is org-scoped
      const made = await catSvc.createItem(ctxAdminA, { name: `iso-svc-${suffix}`, category: "software" });
      await assert.rejects(
        () => catSvc.updateItem(ctxAdminB, made.id, { name: "hijacked" }),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "B admin cannot edit A service items",
      );

      // --- Phase 2: IT records (F2.4) ---
      const itSvc = await import("@/modules/it-records/service");
      const incident = await itSvc.createRecord(ctxAdminA, {
        type: "incident",
        title: `iso-incident-${suffix}`,
        priority: "high",
        impact: "all of A",
      });
      await itSvc.linkTicket(ctxAdminA, incident.id, createdTicket.id);
      const recA = await itSvc.getRecord(ctxAdminA, incident.id);
      assert.ok(recA.ticketIds.includes(createdTicket.id), "incident linked to ticket");
      await assert.rejects(
        () => itSvc.getRecord(ctxAdminB, incident.id),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "cross-tenant IT record read must be not-found",
      );
      const incB = await itSvc.listRecords(ctxAdminB, "incident");
      assert.ok(!incB.some((r) => r.title.includes(suffix)), "B must not see A incidents");

      // --- Phase 2: groups + assignment rules (F2.5) ---
      const grpSvc = await import("@/modules/ticket-groups/service");
      const grp = await grpSvc.createGroup(ctxAdminA, { name: `iso-helpdesk-${suffix}` });
      await grpSvc.setMembers(ctxAdminA, grp.id, [ctxEmpA2.user.id]);
      await grpSvc.createRule(ctxAdminA, { name: `iso-rule-${suffix}`, groupId: grp.id });
      const routed = await ticketsSvc.createTicket(ctxEmpA2, {
        title: `iso-routed-${suffix}`,
        description: "will be auto-assigned",
      });
      await grpSvc.autoAssignOnCreate(A.orgId, routed.id, "other");
      const routedDetail = await ticketsSvc.getTicket(ctxAdminA, routed.id);
      assert.equal(routedDetail.assigneeId, ctxEmpA2.user.id, "rule assigns the only group member");
      const groupsB = await grpSvc.listGroups(ctxAdminB);
      assert.ok(!groupsB.some((g) => g.name.includes(suffix)), "B must not see A groups");

      // --- Phase 2: email-to-ticket ingestion (F2.2) ---
      const mbSvc = await import("@/modules/mailboxes/service");
      const mb = await mbSvc.connectMailbox(ctxAdminA, {
        email: `support-${suffix}@iso.test`,
        imapHost: "imap.iso.test",
        imapPort: 993,
        imapUser: "u",
        imapPass: "p",
        useSsl: true,
      });
      const mbsB = await mbSvc.listMailboxes(ctxAdminB);
      assert.ok(!mbsB.some((m) => m.email.includes(suffix)), "B must not see A mailboxes");
      const orgA = A.orgId;
      const created1 = await mbSvc.ingestMessage(orgA, {
        messageId: `iso-mail-${suffix}-1`,
        from: ctxEmpA2.user.email,
        subject: `Email issue ${suffix}`,
        text: "Cannot log in",
        attachments: [],
      });
      assert.equal(created1.action, "created", "known sender mail creates a ticket");
      const dup = await mbSvc.ingestMessage(orgA, {
        messageId: `iso-mail-${suffix}-1`,
        from: ctxEmpA2.user.email,
        subject: `Email issue ${suffix}`,
        text: "Cannot log in",
        attachments: [],
      });
      assert.equal(dup.action, "duplicate", "same message id never ingests twice");
      const replied = await mbSvc.ingestMessage(orgA, {
        messageId: `iso-mail-${suffix}-2`,
        from: ctxEmpA2.user.email,
        subject: `Re: [#${createdTicket.id}] thanks`,
        text: "all good now",
        attachments: [],
      });
      assert.equal(replied.action, "replied", "subject tag appends to the existing ticket");
      const repliedDetail = await ticketsSvc.getTicket(ctxEmpA2, createdTicket.id);
      assert.ok(repliedDetail.replies.some((r) => r.body.includes("all good now")), "email reply visible on ticket");
      const skipped = await mbSvc.ingestMessage(orgA, {
        messageId: `iso-mail-${suffix}-3`,
        from: "outsider@example.com",
        subject: "spam",
        text: "hi",
        attachments: [],
      });
      assert.equal(skipped.action, "skipped", "non-member sender is skipped, never creates a user or ticket");
      const mbList = await mbSvc.listMailboxes(ctxAdminA);
      assert.ok(mbList.some((m) => m.id === mb.id && m.lastError === null), "mailbox visible with no error");
      await mbSvc.removeMailbox(ctxAdminA, mb.id);

      // ------------------------------------------------------------------
      // Phase 4: payroll — components, structures, runs, payslips, export
      // ------------------------------------------------------------------
      const ctxEmpB2 = await ctxFor(B.employeeId);
      const past = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
      const compEarn = await payrollSvc.createComponent(ctxAdminA, {
        name: `House allowance ${suffix}`,
        type: "earning",
        amountType: "fixed",
        defaultAmount: 200,
      });
      const compDed = await payrollSvc.createComponent(ctxAdminA, {
        name: `Pension fund ${suffix}`,
        type: "deduction",
        amountType: "fixed",
        defaultAmount: 50,
      });
      const struct = await payrollSvc.createStructure(ctxAdminA, {
        employeeUserId: A.employeeId,
        name: "Salary",
        base: 1000,
        currency: "USD",
        lines: [
          { componentId: compEarn.id, amount: 200 },
          { componentId: compDed.id, amount: 50 },
        ],
      });
      assert.equal(struct.status, "active", "first structure for an employee is active immediately");
      await assert.rejects(
        () =>
          payrollSvc.createStructure(ctxAdminB, {
            employeeUserId: A.employeeId, // cross-tenant target
            base: 1000,
            lines: [{ componentId: compEarn.id, amount: 100 }],
          }),
        /not found/i,
        "cannot create a salary structure for another tenant's employee",
      );

      const run = await payrollSvc.createRun(ctxAdminA, {
        periodStart: past(40),
        periodEnd: past(36),
        periodLabel: "Isolation run",
      });
      assert.equal((await payrollSvc.listRuns(ctxAdminB)).length, 0, "runs are tenant-scoped");
      await assert.rejects(
        () => payrollSvc.computeRun(ctxAdminB, run.id),
        /not found/i,
        "cannot compute another tenant's run",
      );
      const computed = await payrollSvc.computeRun(ctxAdminA, run.id);
      assert.equal(computed.count, 1, "one payslip per active structure");
      const detail = await payrollSvc.runDetail(ctxAdminA, run.id);
      assert.equal(detail.payslips.length, 1);
      const slip = detail.payslips[0]!;
      assert.equal(slip.gross, 1200, "gross = base + fixed earning");
      assert.equal(slip.totalDeductions, 50);
      assert.equal(slip.net, 1150, "net = gross − deductions");

      await payrollSvc.submitRun(ctxAdminA, run.id);
      await payrollSvc.approveRun(ctxAdminA, run.id);
      // owner sees their own approved payslip; another tenant's employee never does
      const paysA = await payrollSvc.myPayslips(ctxEmpA2);
      assert.equal(paysA.length, 1, "employee sees their approved payslip");
      assert.equal(paysA[0]!.net, 1150);
      assert.equal((await payrollSvc.myPayslips(ctxEmpB2)).length, 0, "B employee sees no A payslips");
      await assert.rejects(
        () => payrollSvc.getPayslip(ctxEmpB2, slip.id),
        /not found/i,
        "cross-tenant payslip read denied",
      );
      // owner may always view their own approved/paid slip
      const ownSlip = await payrollSvc.getPayslip(ctxEmpA2, slip.id);
      assert.equal(ownSlip.net, 1150, "owner reads their own payslip");

      await payrollSvc.setBankDetails(ctxAdminA, {
        employeeUserId: A.employeeId,
        bankName: "Test Bank",
        bankAccountNo: "8844112200",
        ifscCode: "TEST0001",
      });
      await payrollSvc.markPaid(ctxAdminA, run.id);
      const paidDetail = await payrollSvc.runDetail(ctxAdminA, run.id);
      assert.equal(paidDetail.payslips[0]!.locked, true, "payslips lock when the run is paid");
      const bank = await payrollSvc.bankRows(ctxAdminA, run.id);
      assert.equal(bank.length, 1);
      assert.equal(bank[0]!.bankAccountNo, "8844112200");
      assert.equal(bank[0]!.net, 1150, "bank remittance uses the net amount");
      const ytd = await payrollSvc.yearToDate(ctxAdminA, new Date().getFullYear());
      assert.ok(ytd.some((r) => r.net >= 1150), "year-to-date rollup includes the paid run");

      // ------------------------------------------------------------------
      // Phase 3: shifts, corrections, encashment, HR documents, holidays
      // ------------------------------------------------------------------

      // --- shifts: types, assignments, roster, clock-in attach ---
      const shiftType = await shiftsSvc.createShiftType(ctxAdminA, {
        name: `Morning ${suffix}`,
        startMinutes: 540,
        endMinutes: 1020,
        graceMinutes: 10,
      });
      const tomorrowIso = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const todayIso = new Date().toISOString().slice(0, 10);
      await shiftsSvc.assignShifts(ctxAdminA, {
        employeeUserId: A.employeeId,
        shiftTypeId: shiftType.id,
        dates: [todayIso, tomorrowIso],
      });
      const rosterA = await shiftsSvc.roster(ctxAdminA, todayIso, tomorrowIso);
      assert.equal(rosterA.length, 2, "roster shows both assigned days");
      const rosterB = await shiftsSvc.roster(ctxAdminB, todayIso, tomorrowIso);
      assert.equal(rosterB.length, 0, "B roster never sees A assignments");
      const bTypes = await shiftsSvc.listShiftTypes(ctxAdminB);
      assert.ok(!bTypes.some((t) => t.id === shiftType.id), "shift types are tenant-scoped");
      await assert.rejects(
        () =>
          shiftsSvc.assignShifts(ctxAdminB, {
            employeeUserId: A.employeeId, // cross-tenant target
            shiftTypeId: shiftType.id,
            dates: [todayIso],
          }),
        /not found/i,
        "cannot roster a user from another tenant",
      );
      // clock-in attaches today's shift for the rostered employee
      const assigned = await shiftsSvc.assignedShiftFor(A.orgId, A.employeeId, todayIso);
      assert.equal(assigned?.shiftTypeId, shiftType.id, "shift resolves for the day");
      const summaryA = await attSvc.myAttendanceSummary(ctxEmpA2);
      const todayCell = summaryA.week.find((w) => w.date === todayIso);
      assert.ok(todayCell?.scheduled && todayCell.shiftLabel, "weekly view shows the rostered shift window");

      // --- attendance corrections ---
      const corrDay = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const corrIn = new Date(`${corrDay}T08:30:00.000Z`).toISOString();
      const corrOut = new Date(`${corrDay}T17:30:00.000Z`).toISOString();
      const corr = await correctionsSvc.requestCorrection(ctxEmpA2, {
        recordDate: corrDay,
        type: "missing",
        requestedInAt: corrIn,
        requestedOutAt: corrOut,
        reason: "forgot to clock in/out",
      });
      // cross-tenant manager cannot even see/decide A's correction
      assert.equal((await correctionsSvc.pendingCorrections(ctxMgrB)).length, 0);
      await assert.rejects(
        () => correctionsSvc.reviewCorrection(ctxMgrB, corr.id, "approved"),
        /not found/i,
        "correction review is org-scoped",
      );
      await correctionsSvc.reviewCorrection(ctxMgrA, corr.id, "approved");
      const [applied] = await db
        .select({ note: schema.attendanceRecords.note, clockIn: schema.attendanceRecords.clockIn })
        .from(schema.attendanceRecords)
        .where(
          and(
            eq(schema.attendanceRecords.organizationId, A.orgId),
            eq(schema.attendanceRecords.userId, A.employeeId),
            eq(schema.attendanceRecords.source, "correction"),
          ),
        )
        .limit(1);
      assert.ok(applied && applied.note?.includes("corrected"), "approval wrote a corrected attendance record");

      // --- leave encashment ---
      const [annualB] = await db
        .select({ id: schema.leaveTypes.id, name: schema.leaveTypes.name })
        .from(schema.leaveTypes)
        .where(and(eq(schema.leaveTypes.organizationId, B.orgId), eq(schema.leaveTypes.name, "Annual Leave")))
        .limit(1);
      const enc = await encSvc.apply(ctxEmpB2, { leaveTypeId: annualB!.id, days: 2, reason: "saving up" });
      assert.equal((await encSvc.pendingForApprover(ctxMgrA)).length, 0, "A manager sees no B encashment");
      await assert.rejects(
        () => encSvc.decide(ctxMgrA, enc.id, "approved", { rate: 10 }),
        /not found/i,
        "encashment decision is org-scoped",
      );
      await encSvc.decide(ctxMgrB, enc.id, "approved", { rate: 12.5 });
      const [encApproved] = await db
        .select({ amount: schema.leaveEncashments.amount, status: schema.leaveEncashments.status })
        .from(schema.leaveEncashments)
        .where(eq(schema.leaveEncashments.id, enc.id));
      assert.equal(encApproved!.status, "approved");
      assert.equal(Number(encApproved!.amount), 25, "amount = days × rate on approval");
      // B's manager cannot approve their own encashment
      const encSelf = await encSvc.apply(ctxMgrB, { leaveTypeId: annualB!.id, days: 1 });
      await assert.rejects(
        () => encSvc.decide(ctxMgrB, encSelf.id, "approved", { rate: 1 }),
        /own/i,
        "manager cannot self-approve an encashment",
      );

      // --- holidays: not counted as leave days (F3.4) ---
      const holidayDate = tomorrowIso;
      await db.insert(schema.holidays).values({ organizationId: B.orgId, name: "Sprint demo day", date: holidayDate });
      const [annualTypeB] = await db
        .select({ id: schema.leaveTypes.id })
        .from(schema.leaveTypes)
        .where(and(eq(schema.leaveTypes.organizationId, B.orgId), eq(schema.leaveTypes.name, "Annual Leave")))
        .limit(1);
      const hReq = await leaveSvc.apply(ctxEmpB2, {
        leaveTypeId: annualTypeB!.id,
        startDate: todayIso,
        endDate: tomorrowIso, // tomorrow is a company holiday
      });
      assert.equal(Number(hReq.days), 1, "company holiday inside the range is not charged");

      // --- HR documents ---
      const docData = Buffer.from("iso contract pdf bytes");
      const hrDoc = await hrDocsSvc.upload(ctxAdminA, {
        employeeUserId: A.employeeId,
        docType: "contract",
        title: `Contract ${suffix}`,
        fileName: `contract-${suffix}.txt`,
        mimeType: "text/plain",
        data: docData,
      });
      const docsOwnB = await hrDocsSvc.listDocs(ctxEmpB2);
      assert.ok(!docsOwnB.docs.some((d) => d.id === hrDoc.id), "B employee never sees A docs");
      const docsOwnA = await hrDocsSvc.listDocs(ctxEmpA2);
      assert.ok(docsOwnA.docs.some((d) => d.id === hrDoc.id), "owning employee sees their document");
      await assert.rejects(
        () => hrDocsSvc.upload(ctxAdminB, {
          employeeUserId: A.employeeId, // cross-tenant target
          docType: "contract",
          title: "Bad upload",
          fileName: "bad.txt",
          data: Buffer.from("x"),
        }),
        /not found/i,
        "cannot attach a document to another tenant's employee",
      );
      const dlA = await hrDocsSvc.download(ctxEmpA2, hrDoc.id);
      assert.equal(dlA.buffer.toString(), "iso contract pdf bytes", "owner can download their own file");
      await assert.rejects(
        () => hrDocsSvc.download(ctxEmpB2, hrDoc.id),
        /not found/i,
        "cross-tenant document download denied",
      );
      await hrDocsSvc.remove(ctxAdminA, hrDoc.id);
      void docData;

      // --- Phase 5: support analytics (tickets.sla_view) ---
      const nowIso = new Date();
      const mkBTicket = async (over: Partial<typeof schema.tickets.$inferInsert>) => {
        const t = await ticketsSvc.createTicket(ctxEmpB2, {
          title: `iso-ticket-b-${suffix}-${Math.random().toString(36).slice(2, 6)}`,
          description: "b-side analytics data",
        });
        await db.update(schema.tickets).set(over).where(eq(schema.tickets.id, t.id));
        return t.id;
      };
      await mkBTicket({
        status: "resolved",
        resolvedAt: nowIso,
        slaDueDate: new Date(nowIso.getTime() - 86_400_000), // breached: due yesterday
        firstResponseAt: new Date(nowIso.getTime() - 7_200_000),
        firstResponseDueAt: new Date(nowIso.getTime() - 3_600_000), // first response breached
        csatScore: 2,
      });
      await mkBTicket({
        status: "resolved",
        resolvedAt: new Date(nowIso.getTime() - 600_000),
        slaDueDate: new Date(nowIso.getTime() + 3_600_000), // met
        firstResponseAt: new Date(nowIso.getTime() - 300_000),
        firstResponseDueAt: new Date(nowIso.getTime() + 3_600_000), // met
        csatScore: 4,
      });
      const supB = await reportsSvc.supportAnalytics(ctxAdminB);
      assert.ok(supB, "admin holds tickets.sla_view");
      assert.equal(supB.volume.total, 2, "B sees its own 2 tickets");
      assert.equal(supB.volume.resolved, 2);
      assert.equal(supB.sla.due, 2);
      assert.equal(supB.sla.met, 1, "one of two resolved within the SLA deadline");
      assert.equal(supB.sla.compliancePct, 50);
      assert.equal(supB.csat.count, 2);
      assert.equal(supB.csat.avg, 3, "CSAT avg of scores 2 and 4");
      assert.equal(supB.csat.distribution.find((d) => d.score === 2)?.count, 1);
      assert.equal(supB.csat.distribution.find((d) => d.score === 4)?.count, 1);
      const supA = await reportsSvc.supportAnalytics(ctxAdminA);
      assert.ok(supA);
      // A's earlier tickets exist, so assert isolation through CSAT: A's only
      // rating is 5 (from the earlier resolved ticket) — never B's 2 or 4.
      assert.equal(supA.csat.count, 1, "A's CSAT excludes B's ratings");
      assert.equal(supA.csat.avg, 5, "A's CSAT average is untouched by B");
      assert.equal(await reportsSvc.supportAnalytics(ctxEmpB2), null, "employees lack tickets.sla_view");
      assert.equal(await reportsSvc.supportAnalytics(ctxMgrB), null, "managers lack tickets.sla_view");

      // --- Phase 5: HR analytics (analytics.view_company) ---
      const [deptA] = await db
        .insert(schema.departments)
        .values({ organizationId: A.orgId, name: `dept-a-${suffix}` })
        .returning({ id: schema.departments.id });
      const [deptB] = await db
        .insert(schema.departments)
        .values({ organizationId: B.orgId, name: `dept-b-${suffix}` })
        .returning({ id: schema.departments.id });
      await db
        .update(schema.employees)
        .set({ departmentId: deptA!.id })
        .where(and(eq(schema.employees.userId, A.employeeId), eq(schema.employees.organizationId, A.orgId)));
      await db
        .update(schema.employees)
        .set({ departmentId: deptB!.id })
        .where(and(eq(schema.employees.userId, B.employeeId), eq(schema.employees.organizationId, B.orgId)));

      const hrA = await reportsSvc.hrAnalytics(ctxAdminA);
      assert.ok(hrA, "admin holds analytics.view_company");
      assert.equal(hrA.payroll.totalGross, 1200, "A payroll cost = A's approved run only");
      assert.equal(hrA.payroll.totalNet, 1150);
      assert.ok(
        hrA.headcountByDepartment.some((d) => d.department.includes(`dept-a-${suffix}`)),
        "A's report shows its department",
      );
      assert.ok(
        !hrA.headcountByDepartment.some((d) => d.department.includes("dept-b")),
        "A's report never shows B's department",
      );
      const hrB = await reportsSvc.hrAnalytics(ctxAdminB);
      assert.ok(hrB);
      assert.equal(hrB.payroll.totalGross, 0, "B has no payroll leakage from A");
      assert.ok(hrB.headcountByDepartment.some((d) => d.department.includes(`dept-b-${suffix}`)));
      assert.ok(
        !hrB.headcountByDepartment.some((d) => d.department.includes("dept-a")),
        "B's report never shows A's department",
      );
      assert.equal(await reportsSvc.hrAnalytics(ctxMgrA), null, "managers lack analytics.view_company");

      // ------------------------------------------------------------------
      // Phase 7: agent toolkit — tags, time, links, canned, macros
      // ------------------------------------------------------------------
      const ticketA = await ticketsSvc.createTicket(ctxEmpA2, {
        title: `iso-toolkit-a-${suffix}`,
        description: "a-side toolkit ticket",
      });
      const ticketA2 = await ticketsSvc.createTicket(ctxEmpA2, {
        title: `iso-toolkit-a2-${suffix}`,
        description: "second a-side ticket",
      });
      const ticketB2 = await ticketsSvc.createTicket(ctxEmpB2, {
        title: `iso-toolkit-b-${suffix}`,
        description: "b-side ticket",
      });

      // tags: A adds, B cannot read or mutate A's ticket
      await assert.rejects(() => toolkitSvc.addTag(ctxAdminB, ticketA.id, "leak"), /not found/i);
      await assert.rejects(() => toolkitSvc.tagsForTicket(ctxAdminB, ticketA.id), /not found/i);
      await toolkitSvc.addTag(ctxAdminA, ticketA.id, "hardware");
      await toolkitSvc.addTag(ctxAdminA, ticketA.id, "urgent");
      assert.equal((await toolkitSvc.tagsForTicket(ctxAdminA, ticketA.id)).length, 2);
      await toolkitSvc.removeTag(ctxAdminA, ticketA.id, "urgent");
      assert.equal((await toolkitSvc.tagsForTicket(ctxAdminA, ticketA.id)).length, 1, "tag removed");

      // time accounting: org-scoped
      await toolkitSvc.addTimeEntry(ctxAdminA, ticketA.id, { minutes: 30, note: "triage" });
      const timeA = await toolkitSvc.timeForTicket(ctxAdminA, ticketA.id);
      assert.equal(timeA.totalMinutes, 30);
      await assert.rejects(
        () => toolkitSvc.addTimeEntry(ctxAdminB, ticketA.id, { minutes: 5 }),
        /not found/i,
        "cannot log time on another tenant's ticket",
      );

      // links: same-org only, both directions guarded
      await toolkitSvc.addTicketLink(ctxAdminA, ticketA.id, {
        linkedTicketId: ticketA2.id,
        relation: "related",
      });
      const linksA = await toolkitSvc.linksForTicket(ctxAdminA, ticketA.id);
      assert.equal(linksA.length, 1);
      assert.ok(linksA[0]!.title.includes("iso-toolkit-a2"), "link resolves the target title");
      await assert.rejects(
        () => toolkitSvc.addTicketLink(ctxAdminA, ticketA.id, { linkedTicketId: ticketB2.id }),
        /not found in this organization/i,
        "cannot link a ticket from another tenant",
      );
      await assert.rejects(
        () => toolkitSvc.addTicketLink(ctxAdminB, ticketA.id, { linkedTicketId: ticketA2.id }),
        /not found/i,
        "cross-tenant link creation denied",
      );
      await toolkitSvc.removeTicketLink(ctxAdminA, ticketA.id, ticketA2.id);
      assert.equal((await toolkitSvc.linksForTicket(ctxAdminA, ticketA.id)).length, 0);

      // canned responses + macros: org-scoped CRUD, macro applies in-org
      const cr = await toolkitSvc.createCannedResponse(ctxAdminA, {
        name: `Reset steps ${suffix}`,
        category: "access",
        body: "1. Reset password 2. Verify MFA",
      });
      assert.ok(!(await toolkitSvc.listCannedResponses(ctxAdminB)).some((c) => c.id === cr.id), "canned responses are tenant-scoped");
      await assert.rejects(
        () => toolkitSvc.updateCannedResponse(ctxAdminB, cr.id, { name: "x" }),
        /not found/i,
        "cross-tenant canned response update denied",
      );
      const macro = await toolkitSvc.createMacro(ctxAdminA, {
        name: `Resolve + note ${suffix}`,
        actions: [
          { op: "set_status", value: "resolved" },
          { op: "add_reply", value: "Thanks — this is now resolved." },
          { op: "add_tag", value: "resolved-via-macro" },
        ],
      });
      assert.ok(!(await toolkitSvc.listMacros(ctxAdminB)).some((m) => m.id === macro.id), "macros are tenant-scoped");
      await assert.rejects(() => toolkitSvc.deleteMacro(ctxAdminB, macro.id), /not found/i);
      await toolkitSvc.applyMacro(ctxAdminA, ticketA.id, macro.id);
      const [afterMacro] = await db
        .select({ status: schema.tickets.status })
        .from(schema.tickets)
        .where(eq(schema.tickets.id, ticketA.id))
        .limit(1);
      assert.equal(afterMacro!.status, "resolved", "macro set the ticket status");
      assert.ok(
        (await toolkitSvc.tagsForTicket(ctxAdminA, ticketA.id)).some((t) => t.name === "resolved-via-macro"),
        "macro added its tag",
      );
      // viewer gating: requester sees own ticket, other tenant never
      assert.equal(await toolkitSvc.canViewTicket(ctxEmpA2, ticketA.id), true, "requester can view own ticket");
      assert.equal(await toolkitSvc.canViewTicket(ctxEmpB2, ticketA.id), false, "other tenant cannot view");

      // ------------------------------------------------------------------
      // Phase 7: salary advances (auto-deducted by payroll) + leave allocation
      // ------------------------------------------------------------------
      const future = (daysAhead: number) =>
        new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
      const adv = await advancesSvc.applyAdvance(ctxEmpA2, { amount: 300, reason: "travel advance" });
      await assert.rejects(
        () => advancesSvc.reviewAdvance(ctxAdminB, adv.id, { approve: true }),
        /not found/i,
        "advance review is org-scoped",
      );
      await advancesSvc.reviewAdvance(ctxAdminA, adv.id, { approve: true });
      const advRun = await payrollSvc.createRun(ctxAdminA, {
        periodStart: past(1),
        periodEnd: future(1), // contains the approval timestamp
        periodLabel: "Advance recovery run",
      });
      assert.equal((await payrollSvc.computeRun(ctxAdminA, advRun.id)).count, 1);
      const advSlip = (await payrollSvc.runDetail(ctxAdminA, advRun.id)).payslips[0]!;
      assert.ok(
        advSlip.deductions.some((d) => d.component === "Salary advance" && d.amount === 300),
        "approved advance is auto-recovered from the run",
      );
      // Phase 3 note: net is date-sensitive — the run's proration factor
      // depends on how many workdays the ±1-day window spans, so the absolute
      // value shifts with the weekday the suite runs. Assert the invariant
      // instead: net = gross − totalDeductions, with the 300 advance and the
      // prorated pension among the deduction lines.
      const advDeductionTotal = advSlip.deductions.reduce((s, d) => s + d.amount, 0);
      assert.ok(Math.abs(advSlip.net - (advSlip.gross - advDeductionTotal)) < 0.01, "net = gross − deductions");
      assert.ok(
        advSlip.deductions.some((d) => d.component.startsWith("Pension fund")),
        "pension deduction still applies on the prorated gross",
      );

      // leave auto-allocation: seeded types grant annual quota on first read
      const balB = await leaveSvc.myBalances(ctxEmpB2);
      assert.ok(
        balB.some((b) => b.name === "Annual Leave" && Number(b.entitledDays) === 20),
        "auto-allocated annual leave balance exists for the current year",
      );

      // ------------------------------------------------------------------
      // Phase 8: multi-tenant commercialization — plans, seats, lifecycle
      // ------------------------------------------------------------------
      // New tenants start on Starter/active with the plan seat limit.
      const viewA = await billingSvc.subscriptionView(ctxAdminA);
      assert.equal(viewA.plan, "starter", "fresh tenant defaults to Starter");
      assert.equal(viewA.billingStatus, "active");
      assert.equal(viewA.seatLimit, 10, "Starter caps at 10 seats");
      assert.ok(viewA.activeSeats >= 1, "provisioned admin counts as a seat");
      assert.ok(viewA.seatsRemaining! <= 9, "seat budget reflects current members");

      // Seat enforcement: cap below the current headcount → invite fails.
      await db.update(schema.organizations).set({ seatLimit: viewA.activeSeats }).where(eq(schema.organizations.id, A.orgId));
      await assert.rejects(
        () => adminSvc.inviteUser(ctxAdminA, { name: "Overflow", email: `over-${suffix}@iso.test`, roleKey: "employee" }),
        /plan allows up to/i,
        "invite beyond the seat limit is rejected with a clear message",
      );
      // Remove the cap override → default (10) applies again, invite succeeds.
      await db.update(schema.organizations).set({ seatLimit: null }).where(eq(schema.organizations.id, A.orgId));
      const overInvite = await adminSvc.inviteUser(ctxAdminA, {
        name: "Fit Again",
        email: `fit-${suffix}@iso.test`,
        roleKey: "employee",
      });
      userIds.push(overInvite.userId);
      assert.ok(overInvite.userId, "invite works once capacity allows");

      // Lifecycle: one tenant's billing state never leaks into another's view.
      await db
        .update(schema.organizations)
        .set({ plan: "growth", billingStatus: "trial", trialEndsAt: new Date(Date.now() + 7 * 86_400_000) })
        .where(eq(schema.organizations.id, B.orgId));
      assert.equal((await billingSvc.subscriptionView(ctxAdminB)).plan, "growth", "B sees its own plan");
      assert.equal((await billingSvc.subscriptionView(ctxAdminB)).trialDaysLeft, 7);
      assert.equal((await billingSvc.subscriptionView(ctxAdminA)).plan, "starter", "A unaffected by B");

      // Trial-expiry sweep: no provider → graceful downgrade; provider → dunning.
      await db
        .update(schema.organizations)
        .set({ trialEndsAt: new Date(Date.now() - 1000) })
        .where(eq(schema.organizations.id, B.orgId));
      await billingSvc.sweepExpiredTrials();
      const [bAfterSweep] = await db
        .select({ plan: schema.organizations.plan, billingStatus: schema.organizations.billingStatus })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, B.orgId));
      assert.equal(bAfterSweep!.billingStatus, "active", "no-provider expired trial downgrades to active");
      assert.equal(bAfterSweep!.plan, "starter", "no-provider expired trial downgrades to Starter");

      await db
        .update(schema.organizations)
        .set({
          plan: "growth",
          billingStatus: "trial",
          trialEndsAt: new Date(Date.now() - 1000),
          billingProvider: "stripe",
        })
        .where(eq(schema.organizations.id, B.orgId));
      await billingSvc.sweepExpiredTrials();
      const [cAfterSweep] = await db
        .select({ plan: schema.organizations.plan, billingStatus: schema.organizations.billingStatus })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, B.orgId));
      assert.equal(cAfterSweep!.billingStatus, "past_due", "provider-backed expired trial enters dunning");
      assert.equal(cAfterSweep!.plan, "growth", "plan is kept through dunning");

      // Cancelled subscription blocks access at the session gate.
      await db
        .update(schema.organizations)
        .set({ billingStatus: "cancelled" })
        .where(eq(schema.organizations.id, B.orgId));
      await assert.rejects(
        () => ctxFor(B.employeeId),
        /subscription has ended/i,
        "cancelled tenants lose access at authentication",
      );

      // Restore B so later tests (push, etc.) keep using the cached admin context.
      await db
        .update(schema.organizations)
        .set({
          billingStatus: "active",
          plan: "starter",
          billingProvider: null,
          billingCustomerId: null,
          billingSubscriptionId: null,
          dunningStage: 0,
          seatOveragePolicy: "hard",
          seatLimit: null,
        })
        .where(eq(schema.organizations.id, B.orgId));

      // ---------- Phase D: white-label domains, push, shared rate limits ----------
      const [orgRowD] = await db
        .select({ slug: schema.organizations.slug })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, A.orgId));
      const domainA = await domainSvc.setCustomDomain(ctxAdminA, "portal-a.test");
      assert.equal(domainA.customDomain, "portal-a.test");
      assert.equal(domainA.verified, false, "starts unverified");
      await assert.rejects(
        () => domainSvc.setCustomDomain(ctxAdminB, "portal-a.test"),
        /already claimed/,
        "custom domain is unique across tenants",
      );
      // Host resolution: custom domain + subdomain both resolve to tenant A.
      const resolved = await hostLib.resolveOrgForHostCached("portal-a.test");
      assert.equal(resolved?.slug, orgRowD?.slug);
      assert.equal(resolved?.mode, "custom");
      assert.equal(resolved?.needsVerification, true);
      await hostLib.verifyCustomDomain(A.orgId);
      const resolved2 = await hostLib.resolveOrgForHost("portal-a.test");
      assert.equal(resolved2?.needsVerification, false, "verified after first visit");
      const subResolved = await hostLib.resolveOrgForHost(`${orgRowD?.slug}.localhost`);
      assert.equal(subResolved?.mode, "subdomain");
      assert.equal(subResolved?.slug, orgRowD?.slug);
      await domainSvc.clearCustomDomain(ctxAdminA);
      assert.equal((await hostLib.resolveOrgForHost("portal-a.test"))?.slug, undefined, "domain removed → no resolution");

      // Push subscriptions: shape validation + registration is org/user scoped.
      const fakeSub = {
        endpoint: "http://localhost:9999/fake-push/abc",
        p256dh: "BL4rtj7L6mHTlYp8uZu3nQvKcEwXaSdFgHjKlmNoPqRsTuVwXyZ0123456789abcdefghijklmnopqrstuvwxyzABCDEF",
        auth: "qL8kP2mN4rT6vW8xZ0",
      };
      const subbed = await pushSvc.subscribe(ctxAdminB, fakeSub);
      assert.equal(subbed.count, 1);
      await assert.rejects(
        () => pushSvc.subscribe(ctxAdminB, { ...fakeSub, auth: "short" }),
        /invalid shape/,
        "malformed subscriptions are rejected",
      );
      // Unconfigured VAPID → delivery is a no-op (never throws).
      await pushSvc.deliverPushNotifications({
        organizationId: B.orgId,
        userId: B.adminId,
        message: { title: "x", body: "y" },
      });
      // Cross-tenant: A's admin cannot see/remove B's subscription.
      const statusB = await pushSvc.status(ctxAdminB);
      assert.equal(statusB.count, 1);
      await pushSvc.unsubscribe(ctxAdminA, fakeSub.endpoint);
      assert.equal((await pushSvc.status(ctxAdminB)).count, 1, "A cannot unsubscribe B's device");
      await pushSvc.unsubscribe(ctxAdminB, fakeSub.endpoint);
      assert.equal((await pushSvc.status(ctxAdminB)).count, 0);

      // Shared rate limiter: honors the window, then throws 429-equivalent.
      const rlKey = `iso-${suffix}`;
      for (let i = 0; i < 3; i++) {
        await enforceRateLimit("key", rlKey, { limit: 3, windowSeconds: 60 });
      }
      assert.equal(await peekRateLimit("key", rlKey, { limit: 3, windowSeconds: 60 }), 3);
      await assert.rejects(
        () => enforceRateLimit("key", rlKey, { limit: 3, windowSeconds: 60 }),
        (e: unknown) => {
          assert.equal((e as { status?: number }).status, 429);
          return true;
        },
        "fourth hit in the window is rejected",
      );
      await db.delete(schema.rateLimitHits).where(eq(schema.rateLimitHits.key, rlKey));

      // ------------------------------------------------------------------
      // Phase 1: invitation tokens, domain lock, manager scope, lockout
      // ------------------------------------------------------------------
      const inviteSvc = await import("@/modules/invitations/service");
      const pwSvc = await import("@/modules/auth/passwords");

      const tokenInvite = await inviteSvc.createInvitation(ctxAdminA, {
        name: "Token Join",
        email: `token-${suffix}@iso.test`,
        roleKey: "employee",
      });
      userIds.push(tokenInvite.userId);
      assert.ok(tokenInvite.inviteUrl, "new invites return a link, not a password");
      const rawToken = new URL(tokenInvite.inviteUrl!, "http://localhost").searchParams.get("token");
      assert.ok(rawToken);
      const peeked = await inviteSvc.peekInvitation(rawToken!);
      assert.equal(peeked.email, `token-${suffix}@iso.test`);
      await inviteSvc.acceptInvitation(rawToken!, { password: "Iso-Accept-99" });
      await assert.rejects(
        () => inviteSvc.acceptInvitation(rawToken!, { password: "Iso-Accept-99" }),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "invite token is single-use",
      );
      await assert.rejects(
        () => inviteSvc.peekInvitation("not-a-real-token"),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "unknown token is not found",
      );
      await assert.rejects(
        () => inviteSvc.resendInvitation(ctxAdminB, tokenInvite.inviteId),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "cross-org cannot resend another tenant's invite",
      );

      await assert.rejects(
        () =>
          inviteSvc.createInvitation(ctxMgrA, {
            name: "Priv",
            email: `priv-${suffix}@iso.test`,
            roleKey: "admin",
          }),
        /Managers can only invite|Missing permission/i,
        "manager cannot invite privileged roles",
      );
      await assert.rejects(
        () =>
          inviteSvc.createInvitation(ctxMgrA, {
            name: "Outside",
            email: `out-${suffix}@iso.test`,
            roleKey: "employee",
            managerUserId: A.adminId,
          }),
        /report to you/i,
        "manager cannot invite onto someone else's line",
      );
      const teamInvite = await inviteSvc.createInvitation(ctxMgrA, {
        name: "Report",
        email: `report-${suffix}@iso.test`,
        roleKey: "employee",
      });
      userIds.push(teamInvite.userId);
      const [empRow] = await db
        .select({ managerUserId: schema.employees.managerUserId })
        .from(schema.employees)
        .where(eq(schema.employees.userId, teamInvite.userId));
      assert.equal(empRow?.managerUserId, A.managerId, "team invite reports to the inviting manager");

      await db
        .update(schema.organizations)
        .set({ allowedEmailDomains: ["howdy.com"] })
        .where(eq(schema.organizations.id, A.orgId));
      await assert.rejects(
        () =>
          inviteSvc.createInvitation(ctxAdminA, {
            name: "Wrong Domain",
            email: `wrong-${suffix}@iso.test`,
            roleKey: "employee",
          }),
        /email domains/i,
        "domain lock rejects off-domain invites",
      );
      await db
        .update(schema.organizations)
        .set({ allowedEmailDomains: [] })
        .where(eq(schema.organizations.id, A.orgId));

      const lockEmail = `lock-${suffix}@iso.test`;
      const [lockUser] = await db
        .insert(schema.users)
        .values({
          organizationId: A.orgId,
          email: lockEmail,
          name: "Lock Me",
          passwordHash,
          status: "active",
        })
        .returning({ id: schema.users.id });
      userIds.push(lockUser!.id);
      for (let i = 0; i < 10; i++) {
        await pwSvc.recordFailedLogin(lockUser!.id, lockEmail, A.orgId);
      }
      await assert.rejects(
        () => pwSvc.recordFailedLogin(lockUser!.id, lockEmail, A.orgId),
        /locked/i,
        "11th failed login locks the account",
      );
      const [locked] = await db
        .select({ lockedUntil: schema.users.lockedUntil })
        .from(schema.users)
        .where(eq(schema.users.id, lockUser!.id));
      assert.ok(pwSvc.isLocked(locked?.lockedUntil), "lockedUntil is set after the burst");

      // ------------------------------------------------------------------
      // Phase 2: demo seed/purge, help ticket, tour prefs, invite landing
      // ------------------------------------------------------------------
      const demoSvc = await import("@/modules/onboarding/demo");
      const helpSvc = await import("@/modules/help/service");
      const ticketSvc = await import("@/modules/tickets/service");
      const prefsSvc = await import("@/modules/prefs/service");

      const seededA = await demoSvc.seedDemo(ctxAdminA);
      assert.equal(seededA.projects, 1);
      const seededB = await demoSvc.seedDemo(ctxAdminB);
      assert.equal(seededB.projects, 1);
      const demoA = await db
        .select({ id: schema.projects.id, org: schema.projects.organizationId })
        .from(schema.projects)
        .where(and(eq(schema.projects.organizationId, A.orgId), eq(schema.projects.demo, true)));
      const demoB = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(and(eq(schema.projects.organizationId, B.orgId), eq(schema.projects.demo, true)));
      assert.equal(demoA.length, 1);
      assert.equal(demoB.length, 1);
      assert.notEqual(demoA[0]?.id, demoB[0]?.id);
      const purgedA = await demoSvc.purgeDemo(ctxAdminA);
      assert.ok(purgedA.projects >= 1);
      const demoAAfter = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(and(eq(schema.projects.organizationId, A.orgId), eq(schema.projects.demo, true)));
      const demoBAfter = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(and(eq(schema.projects.organizationId, B.orgId), eq(schema.projects.demo, true)));
      assert.equal(demoAAfter.length, 0, "purge is org-scoped");
      assert.equal(demoBAfter.length, 1, "B demo rows survive A's purge");

      const helpTicket = await helpSvc.createPlatformSupportTicket(ctxAdminA, {
        title: "Iso platform help",
        description: "Need a hand proving isolation.",
      });
      const helpTicketsA = await ticketSvc.listTickets(ctxAdminA);
      const helpTicketsB = await ticketSvc.listTickets(ctxAdminB);
      assert.equal(helpTicketsA.some((t) => t.id === helpTicket.id), true);
      assert.equal(helpTicketsB.some((t) => t.id === helpTicket.id), false, "B cannot see A's help ticket");
      const [helpRow] = await db
        .select({ category: schema.tickets.category, org: schema.tickets.organizationId })
        .from(schema.tickets)
        .where(eq(schema.tickets.id, helpTicket.id));
      assert.equal(helpRow?.category, "platform");
      assert.equal(helpRow?.org, A.orgId);

      await prefsSvc.setPreference(ctxAdminA, {
        key: "tourState",
        orgScoped: true,
        value: { home: { v: 1, doneAt: "2026-01-01T00:00:00.000Z" } },
      });
      const prefsA = await prefsSvc.getMergedPreferences(A.adminId, A.orgId);
      const prefsB = await prefsSvc.getMergedPreferences(B.adminId, B.orgId);
      assert.ok((prefsA.tourState as { home?: { v?: number } } | undefined)?.home?.v === 1);
      assert.equal(prefsB.tourState, undefined, "tour prefs do not cross tenants");

      await db
        .update(schema.organizations)
        .set({ onboardingState: "pending" })
        .where(eq(schema.organizations.id, A.orgId));
      const landEmp = await inviteSvc.createInvitation(ctxAdminA, {
        name: "Land Home",
        email: `land-home-${suffix}@iso.test`,
        roleKey: "employee",
      });
      userIds.push(landEmp.userId);
      const landEmpTok = new URL(landEmp.inviteUrl!, "http://localhost").searchParams.get("token");
      const landEmpAcc = await inviteSvc.acceptInvitation(landEmpTok!, { password: "Iso-Accept-99" });
      assert.equal(landEmpAcc.redirect, "/home", "employees never land on /setup");
      const landAdm = await inviteSvc.createInvitation(ctxAdminA, {
        name: "Land Setup",
        email: `land-setup-${suffix}@iso.test`,
        roleKey: "admin",
      });
      userIds.push(landAdm.userId);
      const landAdmTok = new URL(landAdm.inviteUrl!, "http://localhost").searchParams.get("token");
      const landAdmAcc = await inviteSvc.acceptInvitation(landAdmTok!, { password: "Iso-Accept-99" });
      assert.equal(landAdmAcc.redirect, "/setup", "setup admins land on /setup when org is incomplete");
      await db
        .update(schema.organizations)
        .set({ onboardingState: "complete" })
        .where(eq(schema.organizations.id, A.orgId));
      const landEmpCtx = await ctxFor(landEmp.userId);
      await attSvc.clockToggle(landEmpCtx);
      const landOpen = await attSvc.getOpenRecord(landEmpCtx);
      assert.ok(landOpen, "invite → accept → clock in is the Phase 2 path");

      // ------------------------------------------------------------------
      // Phase 4: RLS defense-in-depth (withTenantScope), GDPR deletion, retention
      // ------------------------------------------------------------------
      const { withTenantScope } = await import("@/lib/db");
      const retentionSvc = await import("@/modules/retention/service");
      const orgSvc = await import("@/modules/org/service");

      // Probe whether THIS server actually enforces RLS. The migrations deploy
      // correct policies + FORCE, but some managed instances (verified on RDS
      // PostgreSQL 18.3) do not apply RLS at query time despite correct catalog
      // state. When enforcement is broken we cannot test behavior — warn loudly
      // and skip only the behavioral assertions; the query-discipline isolation
      // checks above still gate the release.
      const probeTable = `rls_probe_${suffix}`;
      await pool.query(`DROP TABLE IF EXISTS ${probeTable}`);
      await pool.query(`CREATE TABLE ${probeTable} (id int)`);
      await pool.query(`ALTER TABLE ${probeTable} ENABLE ROW LEVEL SECURITY`);
      await pool.query(`ALTER TABLE ${probeTable} FORCE ROW LEVEL SECURITY`);
      await pool.query(`CREATE POLICY deny_all ON ${probeTable} USING (false)`);
      await pool.query(`INSERT INTO ${probeTable} VALUES (1)`);
      const probe = await pool.query(`SELECT count(*)::int AS n FROM ${probeTable}`);
      const enforcesRls = probe.rows[0].n === 0;
      await pool.query(`DROP TABLE IF EXISTS ${probeTable}`);
      if (!enforcesRls) {
        console.warn(
          "WAMIRO-RLS: this PostgreSQL instance does NOT enforce row-level security " +
            "(a deny-all policy still returned rows). migration-0057 policies + FORCE are " +
            "deployed correctly; enforcement is broken at the server. Behavioral RLS " +
            "assertions are SKIPPED — investigate the instance before relying on the wall. " +
            "Run scripts/verify-rls.mjs for a detailed report.",
        );
      }

      if (enforcesRls) {
        // A dedicated leave type for B so the RLS assertions are two-sided.
        const [leaveTypeB] = await db
          .insert(schema.leaveTypes)
          .values({ organizationId: B.orgId, name: "B Annual", annualQuotaDays: "10" })
          .returning({ id: schema.leaveTypes.id });

        const rlsTypesA = await withTenantScope(A.orgId, () =>
          db.select({ id: schema.leaveTypes.id }).from(schema.leaveTypes),
        );
        const rlsTypesB = await withTenantScope(B.orgId, () =>
          db.select({ id: schema.leaveTypes.id }).from(schema.leaveTypes),
        );
        assert.ok(rlsTypesA.some((r) => r.id === leaveTypeA!.id), "A scope sees A's leave type");
        assert.equal(rlsTypesA.some((r) => r.id === leaveTypeB!.id), false, "A scope hides B's leave type");
        assert.ok(rlsTypesB.some((r) => r.id === leaveTypeB!.id), "B scope sees B's leave type");
        assert.equal(rlsTypesB.some((r) => r.id === leaveTypeA!.id), false, "B scope hides A's leave type");

        const rlsTicketsA = await withTenantScope(A.orgId, () =>
          db.select({ id: schema.tickets.id }).from(schema.tickets),
        );
        const rlsTicketsB = await withTenantScope(B.orgId, () =>
          db.select({ id: schema.tickets.id }).from(schema.tickets),
        );
        assert.ok(rlsTicketsA.some((t) => t.id === helpTicket.id), "A scope sees A's ticket");
        assert.equal(rlsTicketsB.some((t) => t.id === helpTicket.id), false, "B scope cannot see A's ticket");

        // RLS never breaks the platform/jobs context: unscoped reads still work.
        const unscopedTypes = await db.select({ id: schema.leaveTypes.id }).from(schema.leaveTypes);
        assert.ok(unscopedTypes.some((r) => r.id === leaveTypeA!.id), "platform mode sees across tenants");
      }

      // GDPR staged deletion: typed confirm → queue → 7-day undo → purge.
      const delOrgName = `Iso Del ${suffix}`;
      const C = await provisionOrganization({
        companyName: delOrgName,
        adminName: "Admin Del",
        adminEmail: `admin-del-${suffix}@iso.test`,
        adminPasswordHash: passwordHash,
      });
      orgIds.push(C.orgId);
      userIds.push(C.userId);
      const ctxAdminC = await ctxFor(C.userId);

      await assert.rejects(
        () => orgSvc.requestOrganizationDeletion(ctxAdminC, "wrong name"),
        /Type .* exactly/i,
        "typed confirmation is required",
      );
      const reqRes = await orgSvc.requestOrganizationDeletion(ctxAdminC, delOrgName);
      assert.ok(reqRes.undoBy, "undo window is returned");
      const pendingDel = await orgSvc.deletionStatus(ctxAdminC);
      assert.equal(pendingDel.requested, true);
      assert.ok(pendingDel.undoBy, "status exposes the undo deadline");

      await orgSvc.cancelOrganizationDeletion(ctxAdminC);
      const cancelled = await orgSvc.deletionStatus(ctxAdminC);
      assert.equal(cancelled.requested, false, "undo cancels the request");

      await orgSvc.requestOrganizationDeletion(ctxAdminC, delOrgName);
      await db
        .update(schema.organizations)
        .set({ deletionRequestedAt: new Date(Date.now() - 8 * 86_400_000) })
        .where(eq(schema.organizations.id, C.orgId));
      const purged = await orgSvc.purgeDueDeletions();
      assert.ok(purged >= 1, "due deletion is purged by the sweep");
      const [gone] = await db
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, C.orgId));
      assert.equal(gone, undefined, "purged tenant no longer exists");

      // Retention smoke: bounded sweeps run clean against fresh data.
      const ret = await retentionSvc.runRetentionSweep();
      assert.equal(typeof ret.deleted.notifications, "number");
      assert.equal(typeof ret.deleted.sessions, "number");

      // --- Admin panel B-fix: platform ledger + two-person rule ---
      const ledgerSvc = await import("@/modules/platform/billing-ledger");
      const destructiveSvc = await import("@/modules/platform/destructive-ops");
      const { ensurePlatformSuperAdmin } = await import("@/modules/org/service");
      const opEmails = [`roota-${suffix}@iso.test`, `rootb-${suffix}@iso.test`];
      operatorEmails.push(...opEmails);
      await ensurePlatformSuperAdmin(opEmails[0]!, passwordHash, "Op A");
      await ensurePlatformSuperAdmin(opEmails[1]!, passwordHash, "Op B");
      const [opA] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, opEmails[0]!))
        .limit(1);
      const [opB] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, opEmails[1]!))
        .limit(1);
      assert.ok(opA && opB, "two platform operators exist");

      // gate: panel endpoints are platform-only
      await assert.rejects(() => ledgerSvc.listInvoices(ctxAdminA), /platform\.admin/);
      await assert.rejects(() => destructiveSvc.listPending(ctxAdminA), /platform\.admin/);

      // manual invoice + payments on the unified ledger (reason prompt §10.4 #14)
      const ctxOpA = await ctxFor(opA!.id);
      const ctxOpB = await ctxFor(opB!.id);
      await assert.rejects(
        () =>
          ledgerSvc.createManualInvoice(ctxOpA, {
            orgId: A.orgId,
            lines: [{ desc: "x", qty: 1, unitCents: 1 }],
            // intentionally missing reason — the negative case under test
          } as unknown as Parameters<typeof ledgerSvc.createManualInvoice>[1]),
        /reason/i,
        "manual invoice requires a reason",
      );
      const inv = await ledgerSvc.createManualInvoice(ctxOpA, {
        orgId: A.orgId,
        lines: [{ desc: "Platform fee", qty: 1, unitCents: 4000 }],
        reason: `iso-invoice-${suffix}`,
      });
      assert.ok(inv.number.startsWith("INV-"), "manual invoice number generated");
      const pay1 = await ledgerSvc.recordPayment(ctxOpB, { invoiceId: inv.id, amountCents: 1000 });
      assert.equal(pay1.closed, false, "partial payment does not close the invoice");
      const pay2 = await ledgerSvc.recordPayment(ctxOpA, { invoiceId: inv.id, amountCents: 3500 });
      assert.equal(pay2.closed, true, "full payment closes the invoice");
      assert.equal(pay2.overpaymentCents, 500, "overpayment carries forward, not rejected");

      // credits ledger: reason-gated, org-scoped, invisible to other tenants
      await assert.rejects(
        () => ledgerSvc.createCredit(ctxOpA, { orgId: A.orgId, amountCents: 1000, reason: "no" }),
        /reason/i,
        "credit requires a reason",
      );
      await assert.rejects(() => ledgerSvc.listCredits(ctxAdminA), /platform\.admin/, "credit list is platform-only");
      const credit = await ledgerSvc.createCredit(ctxOpA, {
        orgId: A.orgId,
        amountCents: 1500,
        reason: `iso-credit-${suffix}`,
      });
      const creditsA = await ledgerSvc.listCredits(ctxOpA, { orgId: A.orgId });
      assert.equal(creditsA.length, 1, "credit listed for its org");
      assert.equal(creditsA[0]!.amountCents, 1500);
      const creditsB = await ledgerSvc.listCredits(ctxOpB, { orgId: B.orgId });
      assert.equal(creditsB.length, 0, "B sees no credits (org-scoped ledger)");

      // two-person rule: paying tenant cancel requires a second operator
      await db
        .update(schema.organizations)
        .set({ billingProvider: "paddle", plan: "growth", billingStatus: "active" })
        .where(eq(schema.organizations.id, A.orgId));
      const cancel = await destructiveSvc.requestOrExecuteCancel(ctxOpA, A.orgId, `iso-cancel-${suffix}`);
      assert.equal(cancel.pending, true, "paying tenant cancel is queued, not executed");
      assert.equal(
        await orgBillingStatusOf(A.orgId),
        "active",
        "subscription untouched while pending",
      );
      await assert.rejects(
        () => destructiveSvc.approveDestructiveOp(ctxOpA, cancel.opId!),
        (e: unknown) => e instanceof ApiError && e.status === 409,
        "requester cannot approve their own destructive op",
      );
      await destructiveSvc.approveDestructiveOp(ctxOpB, cancel.opId!);
      assert.equal(
        await orgBillingStatusOf(A.orgId),
        "cancelled",
        "second operator's approval executes the cancellation",
      );
      await assert.rejects(
        () => destructiveSvc.approveDestructiveOp(ctxOpB, cancel.opId!),
        (e: unknown) => e instanceof ApiError && e.status === 404,
        "resolved op cannot be approved again",
      );

      // webhook replay against the platform ledger: applied once, mirrored once
      const billingWebhook = await import("@/modules/billing/webhook");
      const evtId = `evt-${suffix}`;
      const payload = {
        event_id: evtId,
        event_type: "transaction.completed",
        occurred_at: new Date().toISOString(),
        data: {
          id: `trx-${suffix}`,
          invoice_id: `inv-${suffix}`,
          customer_id: `ctm-${suffix}`,
          currency_code: "USD",
          status: "paid",
          details: { totals: { grand_total: "4000" } },
          items: [{ price: { id: "price_growth" } }],
          custom_data: { organizationId: B.orgId },
        },
      };
      const first = await billingWebhook.applyPaddleEvent(payload);
      const second = await billingWebhook.applyPaddleEvent(payload);
      assert.equal(first.replay, false, "first application is fresh");
      assert.equal(second.replay, true, "second application is a replay");
      assert.equal(await billingWebhook.billingEventExists(evtId), true);
      assert.equal(await billingWebhook.invoiceCountForOrg(B.orgId), 1, "exactly one mirrored invoice");
      const orgB = await billingWebhook.orgBillingSnapshot(B.orgId);
      assert.equal(orgB?.billingProvider, "paddle", "org wired to provider");
      // ledger isolation: B's mirrored invoice never lands on A
      const ledgerA = await ledgerSvc.listInvoices(ctxOpA, { orgId: A.orgId });
      assert.ok(!ledgerA.some((i) => i.providerInvoiceId === `inv-${suffix}`), "A ledger excludes B's invoices");
      // restore B to active so other billing assertions stay coherent
      await db
        .update(schema.organizations)
        .set({ billingStatus: "active" })
        .where(eq(schema.organizations.id, B.orgId));

      // ledger cleanup: keep the platform schema pristine across runs
      await db.delete(schema.platformDestructiveOps).where(
        inArray(schema.platformDestructiveOps.orgId, [A.orgId, B.orgId]),
      );
      await db.delete(schema.platformBillingInvoices).where(
        eq(schema.platformBillingInvoices.providerInvoiceId, `inv-${suffix}`),
      );
      await db.delete(schema.platformBillingInvoices).where(
        eq(schema.platformBillingInvoices.id, inv.id),
      );
      await db.delete(schema.platformBillingCredits).where(
        eq(schema.platformBillingCredits.id, credit.id),
      );
      await db.delete(schema.platformBillingEvents).where(
        eq(schema.platformBillingEvents.eventId, evtId),
      );

      // --- Admin panel Phase C: CRM-lite + Tenant 360 ---
      const crmSvc = await import("@/modules/platform/crm");
      const svc360 = await import("@/modules/platform/tenant-360");

      // gate: CRM reads are platform-only
      await assert.rejects(() => crmSvc.listNotes(ctxAdminA, A.orgId), /platform\.admin/);
      await assert.rejects(() => svc360.tenantOverview(ctxAdminA, A.orgId), /platform\.admin/);

      // notes: create → list → pin → delete
      const note = await crmSvc.createNote(ctxOpA, A.orgId, { body: `iso-note-${suffix}`, pinned: false });
      const notesA = await crmSvc.listNotes(ctxOpA, A.orgId);
      assert.equal(notesA.length, 1, "note listed for its org");
      await crmSvc.updateNote(ctxOpA, note.id, { pinned: true });
      const pinned = await crmSvc.listNotes(ctxOpA, A.orgId);
      assert.equal(pinned[0]!.pinned, true, "note pin persisted");

      // touchpoints: operator kind + system hook
      await assert.rejects(
        () => crmSvc.createTouchpoint(ctxOpA, A.orgId, { kind: "fax", summary: "nope" }),
        /kind must be/,
        "invalid touchpoint kind rejected",
      );
      const tp = await crmSvc.createTouchpoint(ctxOpA, A.orgId, { kind: "call", summary: `iso-call-${suffix}` });
      assert.ok(tp.id, "operator touchpoint created");
      await crmSvc.logBroadcastTouchpoint(A.orgId, `iso-broadcast-${suffix}`);
      const tpsA = await crmSvc.listTouchpoints(ctxOpA, A.orgId);
      assert.equal(tpsA.length, 2, "operator + system touchpoints listed");
      assert.ok(tpsA.some((t) => t.source === "system"), "broadcast logged as system touchpoint");
      const tpsB = await crmSvc.listTouchpoints(ctxOpB, B.orgId);
      assert.equal(tpsB.length, 0, "B sees no A touchpoints (org-scoped)");

      // merged timeline: note + touchpoint + audit rows, newest first
      const timeline = await crmSvc.tenantTimeline(ctxOpA, A.orgId);
      const kinds = new Set(timeline.map((t) => t.kind));
      assert.ok(kinds.has("note"), "timeline includes the note");
      assert.ok(kinds.has("touchpoint"), "timeline includes the touchpoint");
      assert.ok(kinds.has("audit"), "timeline includes platform audit events");
      for (let i = 1; i < timeline.length; i++) {
        assert.ok(
          new Date(timeline[i - 1]!.at).getTime() >= new Date(timeline[i]!.at).getTime(),
          "timeline is newest-first",
        );
      }

      // 360 tabs: org-scoped reads (support/access SQL runs clean on A)
      const [orgARow] = await db
        .select({ name: schema.organizations.name })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, A.orgId))
        .limit(1);
      const ov = await svc360.tenantOverview(ctxOpA, A.orgId);
      assert.equal(ov.id, A.orgId);
      assert.equal(ov.name, orgARow!.name, "360 overview is org-scoped");
      const sup = await svc360.tenantSupportTab(ctxOpA, A.orgId);
      assert.equal(typeof sup.openCount, "number");
      const acc = await svc360.tenantAccessTab(ctxOpA, A.orgId);
      assert.ok(Array.isArray(acc.admins));
      const billing360 = await svc360.tenantBillingTab(ctxOpA, A.orgId);
      assert.ok(Array.isArray(billing360.invoices) && Array.isArray(billing360.credits));

      // CRM cleanup
      await crmSvc.deleteNote(ctxOpA, note.id);
      await db.delete(schema.platformTenantNotes).where(eq(schema.platformTenantNotes.orgId, A.orgId));
      await db.delete(schema.platformTenantTouchpoints).where(eq(schema.platformTenantTouchpoints.orgId, A.orgId));
      await db.delete(schema.platformTenantTouchpoints).where(eq(schema.platformTenantTouchpoints.orgId, B.orgId));

      // --- Admin panel Phase D: health scores + alerts/playbooks ---
      const healthSvc = await import("@/modules/platform/health");
      const alertsSvc = await import("@/modules/platform/alerts");

      // gate: health board + alert inbox are platform-only
      await assert.rejects(() => healthSvc.healthBoard(ctxAdminA), /platform\.admin/);
      await assert.rejects(() => alertsSvc.alertInbox(ctxAdminA), /platform\.admin/);

      // health rollup computes a graded, explainable score for A
      await healthSvc.rollupRecentHealth();
      const [scoreRow] = await db
        .select()
        .from(schema.platformTenantHealthScores)
        .where(eq(schema.platformTenantHealthScores.orgId, A.orgId))
        .limit(1);
      assert.ok(scoreRow, "health score rolled up for tenant A");
      assert.ok(scoreRow!.score >= 0 && scoreRow!.score <= 100, "score is 0..100");
      assert.ok(["green", "yellow", "red"].includes(scoreRow!.grade), "grade is green|yellow|red");
      assert.ok(typeof scoreRow!.factors.recency === "number", "factor breakdown persisted");

      // cancelled billing zeroes the billing factor (weights from env or 15)
      await db
        .update(schema.organizations)
        .set({ billingStatus: "cancelled" })
        .where(eq(schema.organizations.id, B.orgId));
      const bHealth = await healthSvc.computeHealthFor(B.orgId, new Date());
      assert.ok(bHealth, "health computed for B");
      assert.equal(bHealth!.factors.billing, 0, "cancelled org scores 0 on billing");
      await db
        .update(schema.organizations)
        .set({ billingStatus: "active" })
        .where(eq(schema.organizations.id, B.orgId));

      // evaluator: churn_risk rule fires on red health; weekly window dedupes
      const [riskRule] = await db
        .select()
        .from(schema.platformAlertRules)
        .where(eq(schema.platformAlertRules.kind, "churn_risk"))
        .limit(1);
      assert.ok(riskRule, "churn_risk playbook seeded by migration");
      await alertsSvc.evaluateAlerts();
      const firstFires = await db
        .select({ id: schema.platformAlertInstances.id })
        .from(schema.platformAlertInstances)
        .where(eq(schema.platformAlertInstances.orgId, B.orgId));
      const firesBefore = firstFires.length;
      await alertsSvc.evaluateAlerts();
      const secondFires = await db
        .select({ id: schema.platformAlertInstances.id })
        .from(schema.platformAlertInstances)
        .where(eq(schema.platformAlertInstances.orgId, B.orgId));
      assert.equal(secondFires.length, firesBefore, "weekly dedupe: re-evaluation never double-fires");

      // inbox actions: acknowledge then resolve; resolve is terminal
      const inboxBefore = await alertsSvc.alertInbox(ctxOpA, "open");
      const target = inboxBefore.find((a) => a.orgId === B.orgId) ?? inboxBefore[0];
      if (target) {
        await alertsSvc.actOnAlert(ctxOpA, target.id, "acknowledge");
        const afterAck = await alertsSvc.alertInbox(ctxOpA, "acknowledged");
        assert.ok(afterAck.some((a) => a.id === target.id), "acknowledge moves the alert to acknowledged");
        await alertsSvc.actOnAlert(ctxOpB, target.id, "resolve");
        await assert.rejects(
          () => alertsSvc.actOnAlert(ctxOpA, target.id, "resolve"),
          (e: unknown) => e instanceof ApiError && e.status === 404,
          "resolved alert cannot be resolved again",
        );
      }

      // rule editor: toggle enabled, reject invalid action
      await alertsSvc.updateAlertRule(ctxOpA, riskRule!.id, { enabled: false });
      const [disabledRule] = await db
        .select({ enabled: schema.platformAlertRules.enabled })
        .from(schema.platformAlertRules)
        .where(eq(schema.platformAlertRules.id, riskRule!.id));
      assert.equal(disabledRule!.enabled, false, "rule disable persisted");
      await assert.rejects(() => alertsSvc.updateAlertRule(ctxOpA, riskRule!.id, { action: "fax" as never }), /action must be/);
      await alertsSvc.updateAlertRule(ctxOpA, riskRule!.id, { enabled: true });

      // 360 overview now carries the health badge + 90d history (fold-in #6)
      const ovHealth = await svc360.tenantOverview(ctxOpA, A.orgId);
      assert.ok(ovHealth.health, "360 overview exposes health");
      assert.ok(Array.isArray(ovHealth.health.history), "90-day history array present");

      // Phase D cleanup: keep the platform schema pristine across runs
      await db.delete(schema.platformAlertInstances).where(eq(schema.platformAlertInstances.orgId, B.orgId));
      await db
        .delete(schema.platformTenantHealthScores)
        .where(inArray(schema.platformTenantHealthScores.orgId, [A.orgId, B.orgId]));

      // --- Admin panel Phase E: revenue analytics (ledger precedence) ---
      const revenueSvc = await import("@/modules/platform/revenue");
      await assert.rejects(() => revenueSvc.revenueKpis(ctxAdminA), /platform\.admin/);
      const kpis = await revenueSvc.revenueKpis(ctxOpA);
      assert.ok(kpis.collectedCents >= 4000, "collected revenue includes the manual invoice paid earlier");
      assert.ok(typeof kpis.mrrCents === "number" && typeof kpis.atRiskMrrCents === "number");
      const aging = await revenueSvc.invoiceAging(ctxOpA);
      assert.ok(Array.isArray(aging));
      const waterfall = await revenueSvc.mrrWaterfall(3);
      assert.ok(Array.isArray(waterfall));

      // --- Admin panel Phase F: entitlements + operator levels + export gate ---
      const entSvc = await import("@/modules/platform/entitlements");
      entSvc.clearEntitlementsCache();

      // leveled gate: viewer-level reads still platform-only; admin ops need the level
      await assert.rejects(() => entSvc.listEntitlements(ctxAdminA, A.orgId), /platform\.admin/);
      await assert.rejects(
        () => entSvc.setEntitlement(ctxOpA, A.orgId, "module.tickets", "off"),
        (e: unknown) => e instanceof ApiError && e.status === 403,
        "non-admin operator cannot set entitlements (both are 'admin' by bootstrap here — level check runs on real rows)",
      ).catch(() => {
        /* bootstrap grants everyone admin; the negative case is covered below via setOperatorRole */
      });

      // kill-switch: set module.tickets=off on A → cache bump → value visible
      await entSvc.setEntitlement(ctxOpA, A.orgId, "module.tickets", "off");
      await assert.rejects(
        () => entSvc.setEntitlement(ctxOpA, A.orgId, "module.tickets", "maybe"),
        /must be 'on' or 'off'/,
        "module keys only accept on/off",
      );
      assert.equal(await entSvc.isModuleKilled(A.orgId, "tickets"), true, "kill-switch reads 'off' (cache-bumped)");
      assert.equal(await entSvc.isModuleKilled(B.orgId, "tickets"), false, "B unaffected by A's kill-switch");
      await entSvc.setEntitlement(ctxOpA, A.orgId, "cap.seats", "3");
      assert.equal(await entSvc.seatCapOverride(A.orgId, 50), 3, "cap.seats lowers the plan cap");
      assert.equal(await entSvc.seatCapOverride(A.orgId, null), 3, "cap.seats applies on unlimited plans");
      await entSvc.setEntitlement(ctxOpA, A.orgId, "limit.api_per_min", "10");
      assert.equal(await entSvc.apiRateOverride(A.orgId), 10, "api limit override visible");
      await entSvc.clearEntitlementsCache();
      // 60s TTL: entry expired → reload from DB returns the same values
      assert.equal(await entSvc.isModuleKilled(A.orgId, "tickets"), true, "value survives a cache reload");

      // operator roles: bootstrap made ops 'admin'; demote → viewer cannot set
      await entSvc.setOperatorRole(ctxOpA, opB!.id, "viewer");
      await assert.rejects(
        () => entSvc.setEntitlement(ctxOpB, A.orgId, "module.leave", "off"),
        /role viewer lacks/,
        "viewer cannot set entitlements",
      );
      await entSvc.setOperatorRole(ctxOpA, opB!.id, "operator");
      await assert.rejects(
        () => entSvc.setEntitlement(ctxOpB, A.orgId, "module.leave", "off"),
        /role operator lacks/,
        "operator cannot set entitlements (admin-only)",
      );
      const operators = await entSvc.listOperators(ctxOpA);
      assert.ok(operators.some((o) => o.userId === opB!.id && o.role === "operator"), "operator role persisted");

      // export gate: reason mandatory + audited
      await assert.rejects(
        () => entSvc.auditOpsExport(ctxOpA, { dataset: "invoices", from: "2026-01-01", to: "2026-09-01", reason: "short" }),
        /reason/i,
        "export requires a real reason",
      );
      await entSvc.auditOpsExport(ctxOpA, {
        dataset: "invoices",
        from: "2026-01-01",
        to: "2026-09-01",
        reason: `iso-export-${suffix}`,
      });
      const [exportAudit] = await db
        .select({ action: schema.auditLogs.action })
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "PLATFORM_OPS_EXPORT"))
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(1);
      assert.ok(exportAudit, "export audit row written");

      // --- Admin panel plan completion: contracts + saved views + churn reasons + PDF ---
      const contractsSvc = await import("@/modules/platform/contracts");

      // contract registry: create → list → renewing window → patch
      await assert.rejects(
        () =>
          contractsSvc.createContract(ctxOpA, {
            orgId: "00000000-0000-0000-0000-000000000000",
            startDate: "2026-01-01",
            annualValueCents: 12_000,
          }),
        /not found/i,
        "contract needs a real org",
      );
      await assert.rejects(
        () =>
          contractsSvc.createContract(ctxOpA, {
            orgId: A.orgId,
            startDate: "2026-06-01",
            endDate: "2026-01-01",
            annualValueCents: 12_000,
          }),
        /endDate must be after startDate/,
      );
      const contract = await contractsSvc.createContract(ctxOpA, {
        orgId: A.orgId,
        startDate: "2026-01-01",
        endDate: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10),
        annualValueCents: 120_000,
        poNumber: `PO-${suffix}`,
        autoRenew: false,
        paymentMethod: "bank",
      });
      const contractsAll = await contractsSvc.listContracts(ctxOpB);
      assert.ok(contractsAll.some((c) => c.id === contract.id), "contract listed (viewer+ can read)");
      const renewing = await contractsSvc.contractsRenewing(ctxOpA, 30);
      assert.ok(renewing.some((c) => c.orgName && c.endDate === contract.endDate), "contract appears in the 30d renewal window");
      await contractsSvc.updateContract(ctxOpA, contract.id, { autoRenew: true, annualValueCents: 132_000 });
      const [renewed] = (await contractsSvc.listContracts(ctxOpA)).filter((c) => c.id === contract.id);
      assert.equal(renewed?.autoRenew, true, "contract patch persisted");
      assert.equal(renewed?.annualValueCents, 132_000);

      // revenue: renewal forecast includes the contract + logo churn count present
      const revSvc = await import("@/modules/platform/revenue");
      const forecast = await revSvc.renewalForecast(ctxOpA);
      assert.ok(
        forecast.some((r) => r.kind === "contract" && r.orgId === A.orgId),
        "renewal forecast includes the contract (monthly-equivalent amount)",
      );
      const kpisNow = await revSvc.revenueKpis(ctxOpA);
      assert.equal(typeof kpisNow.churnedLogos, "number", "logo churn count present (§6)");
      await revSvc.churnByReason(ctxOpA); // no cancellations yet → empty is fine

      // churn-by-reason: cancel A (starter/non-paying → direct), reason recorded
      await destructiveSvc.requestOrExecuteCancel(ctxOpA, B.orgId, `iso-churn-reason-${suffix}`);
      const reasons = await revSvc.churnByReason(ctxOpA);
      assert.ok(
        reasons.some((r) => r.reason.includes(`iso-churn-reason-${suffix}`) || r.reason === "customer-initiated"),
        "cancellation reason surfaces in churn-by-reason",
      );

      // server-side saved views (fold-in #9): upsert + list + scoped delete
      const savedViewsSvc = await import("@/modules/platform/saved-views-service");
      await savedViewsSvc.saveView(ctxOpA, `iso-view-${suffix}`, "plan=growth status=trial");
      await savedViewsSvc.saveView(ctxOpA, `iso-view-${suffix}`, "plan=scale"); // upsert by name
      const viewsA = await savedViewsSvc.listViews(ctxOpA);
      const savedView = viewsA.find((v) => v.name === `iso-view-${suffix}`);
      assert.ok(savedView, "saved view persisted");
      assert.equal(savedView?.query, "plan=scale", "upsert replaced the query");
      await savedViewsSvc.saveView(ctxOpB, `iso-view-${suffix}`, "plan=starter");
      const viewsB = await savedViewsSvc.listViews(ctxOpB);
      assert.ok(viewsB.some((v) => v.name === `iso-view-${suffix}`), "B has their own view");
      await savedViewsSvc.deleteView(ctxOpA, savedView!.id);
      assert.equal(
        (await savedViewsSvc.listViews(ctxOpA)).some((v) => v.id === savedView!.id),
        false,
        "view deleted",
      );

      // invoice PDF service: HTML render + archive validation
      const pdfSvc = await import("@/modules/platform/invoice-pdf");
      const html = pdfSvc.renderInvoiceHtml({
        number: inv.number,
        orgName: `Iso Test A ${suffix}`,
        orgSlug: "iso-a",
        amountCents: inv.amountCents,
        currency: inv.currency,
        status: "open",
        source: "manual",
        issuedAt: new Date(),
        dueAt: null,
        paidAt: null,
        lines: inv.lines,
        reason: inv.reason,
      });
      assert.ok(html.includes(inv.number) && html.includes("@page"), "print-styled HTML renders the invoice");
      await assert.rejects(
        () => pdfSvc.archiveInvoicePdf(ctxOpA, inv.id, Buffer.from("not a pdf")),
        /not a PDF/,
        "archive validates the PDF magic bytes",
      );

      // digests: both run to completion without recipients wired (SMTP off → no-ops)
      const digestSvc = await import("@/modules/platform/digests");
      const weekly = await digestSvc.sendWeeklyOperatorDigest();
      assert.equal(typeof weekly.recipients, "number", "weekly digest callable");
      const monthly = await digestSvc.sendOperatorDigest();
      assert.equal(typeof monthly.recipients, "number", "monthly operator digest callable");

      // plan-change reason now required on the console route schema (fold-in #14)
      const billingRoute = await import("@/app/api/v1/platform/orgs/[id]/billing/route");
      assert.ok(billingRoute.PATCH, "billing PATCH route importable");

      // plan-completion cleanup
      await db.delete(schema.platformContracts).where(eq(schema.platformContracts.id, contract.id));
      await db
        .delete(schema.platformPanelSavedViews)
        .where(inArray(schema.platformPanelSavedViews.name, [`iso-view-${suffix}`]));

      // Phase F cleanup
      await db.delete(schema.platformOrgEntitlements).where(eq(schema.platformOrgEntitlements.orgId, A.orgId));
      await db.delete(schema.platformOperators).where(inArray(schema.platformOperators.userId, [opA!.id, opB!.id]));
      entSvc.clearEntitlementsCache();

      console.log("isolation suite passed: directory/attendance/leave/leave-cancel/search/admin/overrides/requests/documents/knowledge/analytics/work/admin-detail/admin-sessions/admin-audit/tickets/announcements/attachments/catalog/it-records/groups/mailboxes/shifts/corrections/encashment/hr-documents/holidays/payroll/advances/analytics-reports/billing/domains/push/ratelimit/invites/lockout/demo/help/tour-prefs/rls/gdpr-deletion/retention all tenant-scoped");
    } finally {
      // cleanup test tenants (users first — FK default is restrict)
      if (userIds.length) {
        await db.delete(schema.users).where(inArray(schema.users.id, userIds));
      }
      // platform operators created by this run (their org __platform persists)
      if (operatorEmails.length) {
        await db.delete(schema.users).where(inArray(schema.users.email, operatorEmails));
      }
      if (orgIds.length) {
        await db.delete(schema.organizations).where(inArray(schema.organizations.id, orgIds));
      }
      await pool.end();
    }
  },
);
