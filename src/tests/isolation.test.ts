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
      assert.equal(advSlip.net, 850, "net = 1200 − 50 (pension) − 300 (advance)");

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

      console.log("isolation suite passed: directory/attendance/leave/search/admin/overrides/requests/documents/knowledge/analytics/work/admin-detail/admin-sessions/admin-audit/tickets/announcements/attachments/catalog/it-records/groups/mailboxes/shifts/corrections/encashment/hr-documents/holidays/payroll/advances/analytics-reports/billing/domains/push/ratelimit all tenant-scoped");
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
