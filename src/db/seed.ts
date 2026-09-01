/**
 * Idempotent seed: Howdy Analytics tenant #1 + demo users.
 * Run: npm run db:seed   (requires DATABASE_URL)
 *
 * Demo passwords are printed to console — change before real use.
 */
import { and, eq } from "drizzle-orm";

import { db, first, pool } from "@/lib/db";
import {
  attendanceRecords,
  goals,
  departments,
  employees,
  knowledgeArticles,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  organizations,
  projectMembers,
  projects,
  requestTypes,
  requests,
  rolePermissions,
  roles,
  tasks,
  userRoles,
  users,
  type RequestTypeField,
} from "./schema";
import { hashPassword } from "@/lib/password";
import { SYSTEM_ROLES } from "@/modules/iam/catalog";

const ORG_NAME = "Howdy Analytics";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Wamiro-Demo-2026!";

async function upsertOrg() {
  const existing = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "howdy-analytics"))
    .limit(1);
  if (existing[0]) return existing[0];
  const org = await db
    .insert(organizations)
    .values({
      name: ORG_NAME,
      slug: "howdy-analytics",
      timezone: "Asia/Kolkata",
      currency: "INR",
    })
    .returning();
  return first(org);
}

async function ensureRoles(orgId: string) {
  const map = new Map<string, string>();
  for (const t of SYSTEM_ROLES) {
    const existing = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.organizationId, orgId), eq(roles.key, t.key)))
      .limit(1);
    let roleId = existing[0]?.id;
    if (!roleId) {
      const r = await db
        .insert(roles)
        .values({ organizationId: orgId, key: t.key, name: t.name, description: t.description, isSystem: true })
        .returning({ id: roles.id })
        .then(first);
      roleId = r.id;
    }
    const grants = await db
      .select({ permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId))
      .limit(1);
    if (!grants[0] && t.grants.length) {
      await db.insert(rolePermissions).values(
        t.grants.map(([permission, scope]) => ({ roleId, permission, scope })),
      );
    }
    map.set(t.key, roleId);
  }
  return map;
}

async function ensureUser(opts: {
  orgId: string;
  email: string;
  name: string;
  passwordHash: string;
}) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, opts.email))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const u = await db
    .insert(users)
    .values({
      organizationId: opts.orgId,
      email: opts.email,
      name: opts.name,
      passwordHash: opts.passwordHash,
      status: "active",
    })
    .returning({ id: users.id })
    .then(first);
  return u.id;
}

async function main() {
  const superEmail = process.env.SEED_SUPER_ADMIN_EMAIL;
  const superPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;

  const org = await upsertOrg();
  const roleMap = await ensureRoles(org.id);
  const demoHash = await hashPassword(DEMO_PASSWORD);

  // Platform super admin (optional)
  if (superEmail && superPassword) {
    const { ensurePlatformSuperAdmin } = await import("@/modules/org/service");
    await ensurePlatformSuperAdmin(superEmail, await hashPassword(superPassword));
    console.log(`platform super admin ready: ${superEmail}`);
  }

  // Departments
  async function ensureDepartment(name: string): Promise<string> {
    const found = await db
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.organizationId, org.id), eq(departments.name, name)))
      .limit(1);
    if (found[0]) return found[0].id;
    const d = await db
      .insert(departments)
      .values({ organizationId: org.id, name })
      .returning({ id: departments.id })
      .then(first);
    return d.id;
  }
  // Full demo org: 6 departments (Marketing, Engineering, IT,
  // Operations, Product, CX) + 1 Exec department for the C-suite
  const execDept     = await ensureDepartment("Executive");
  const marketingDept = await ensureDepartment("Marketing");
  const engDept      = await ensureDepartment("Engineering");
  const itDept       = await ensureDepartment("IT");
  const opsDept      = await ensureDepartment("Operations");
  const productDept  = await ensureDepartment("Product");
  const cxDept       = await ensureDepartment("Customer Experience");

  // People — full company hierarchy
  const ceo = await ensureUser({ orgId: org.id, email: "ceo@howdy.test", name: "Asha Mehta", passwordHash: demoHash });
  const hr = await ensureUser({ orgId: org.id, email: "hr@howdy.test", name: "Rohit Verma", passwordHash: demoHash });
  const manager = await ensureUser({ orgId: org.id, email: "manager@howdy.test", name: "Priya Nair", passwordHash: demoHash });
  const employee = await ensureUser({ orgId: org.id, email: "employee@howdy.test", name: "Karan Shah", passwordHash: demoHash });

  // C-suite — reports to CEO
  const cmo = await ensureUser({ orgId: org.id, email: "cmo@howdy.test", name: "Diya Iyer", passwordHash: demoHash });
  const coo = await ensureUser({ orgId: org.id, email: "coo@howdy.test", name: "Vikram Bose", passwordHash: demoHash });
  const cpo = await ensureUser({ orgId: org.id, email: "cpo@howdy.test", name: "Anjali Rao", passwordHash: demoHash });
  const cto = await ensureUser({ orgId: org.id, email: "cto@howdy.test", name: "Rahul Khanna", passwordHash: demoHash });

  // Marketing
  const mgrMarketing = await ensureUser({ orgId: org.id, email: "head-marketing@howdy.test", name: "Sneha Reddy", passwordHash: demoHash });
  const seoLead     = await ensureUser({ orgId: org.id, email: "seo-lead@howdy.test", name: "Aman Gupta", passwordHash: demoHash });
  const contentMgr  = await ensureUser({ orgId: org.id, email: "content-mgr@howdy.test", name: "Tara Bhatt", passwordHash: demoHash });
  const designer     = await ensureUser({ orgId: org.id, email: "designer@howdy.test", name: "Kavya Menon", passwordHash: demoHash });

  // Engineering
  const mgrEng = manager; // reuse existing
  const headBackend      = await ensureUser({ orgId: org.id, email: "head-backend@howdy.test", name: "Aditya Pillai", passwordHash: demoHash });
  const backendEng       = employee; // reuse existing
  const backendEng2      = await ensureUser({ orgId: org.id, email: "backend-2@howdy.test", name: "Rohan Joshi", passwordHash: demoHash });
  const headFrontend     = await ensureUser({ orgId: org.id, email: "head-frontend@howdy.test", name: "Anika Desai", passwordHash: demoHash });
  const frontendEng      = await ensureUser({ orgId: org.id, email: "frontend@howdy.test", name: "Vivaan Kumar", passwordHash: demoHash });
  const qaSpecialist     = await ensureUser({ orgId: org.id, email: "qa@howdy.test", name: "Ishaan Chatterjee", passwordHash: demoHash });

  // IT
  const mgrIT       = await ensureUser({ orgId: org.id, email: "head-it@howdy.test", name: "Devansh Saxena", passwordHash: demoHash });
  const itSpecialist = await ensureUser({ orgId: org.id, email: "it-spec@howdy.test", name: "Aarav Mishra", passwordHash: demoHash });
  const itSupport    = await ensureUser({ orgId: org.id, email: "it-support@howdy.test", name: "Anaya Pandey", passwordHash: demoHash });

  // Operations
  const mgrOps        = await ensureUser({ orgId: org.id, email: "head-ops@howdy.test", name: "Krishna Iyer", passwordHash: demoHash });
  const financeLead   = await ensureUser({ orgId: org.id, email: "finance-lead@howdy.test", name: "Riya Banerjee", passwordHash: demoHash });
  const financeAnalyst = await ensureUser({ orgId: org.id, email: "finance-analyst@howdy.test", name: "Aryan Chopra", passwordHash: demoHash });

  // Product
  const mgrProduct    = await ensureUser({ orgId: org.id, email: "head-product@howdy.test", name: "Saanvi Kapoor", passwordHash: demoHash });
  const productAnalyst = await ensureUser({ orgId: org.id, email: "product-analyst@howdy.test", name: "Arjun Malhotra", passwordHash: demoHash });
  const uxResearcher   = await ensureUser({ orgId: org.id, email: "ux-research@howdy.test", name: "Diya Sharma", passwordHash: demoHash });

  // Customer Experience
  const mgrCX        = await ensureUser({ orgId: org.id, email: "head-cx@howdy.test", name: "Aaradhya Pandey", passwordHash: demoHash });
  const csmLead      = await ensureUser({ orgId: org.id, email: "csm-lead@howdy.test", name: "Vihaan Joshi", passwordHash: demoHash });
  const supportLead  = await ensureUser({ orgId: org.id, email: "support-lead@howdy.test", name: "Myra Bansal", passwordHash: demoHash });
  const supportAgent = await ensureUser({ orgId: org.id, email: "support-agent@howdy.test", name: "Reyansh Trivedi", passwordHash: demoHash });

  for (const [userId, roleKeys] of [
    [ceo, ["ceo", "admin"]],
    [hr, ["hr_admin"]],
    [manager, ["manager"]],
    [employee, ["employee"]],
  ] as const) {
    for (const key of roleKeys) {
      await db
        .insert(userRoles)
        .values({ userId, roleId: roleMap.get(key)! })
        .onConflictDoNothing();
    }
  }

  async function ensureEmployee(
    userId: string,
    opts: { jobTitle: string; departmentId: string; managerUserId?: string | null },
  ) {
    const found = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, userId)).limit(1);
    if (found[0]) return;
    await db.insert(employees).values({
      organizationId: org.id,
      userId,
      jobTitle: opts.jobTitle,
      departmentId: opts.departmentId,
      managerUserId: opts.managerUserId ?? null,
      hiredAt: new Date().toISOString().slice(0, 10),
    });
  }

  // C-suite
  await ensureEmployee(ceo, { jobTitle: "Chief Executive Officer", departmentId: execDept });
  await ensureEmployee(cmo, { jobTitle: "Chief Marketing Officer", departmentId: execDept, managerUserId: ceo });
  await ensureEmployee(coo, { jobTitle: "Chief Operating Officer", departmentId: execDept, managerUserId: ceo });
  await ensureEmployee(cpo, { jobTitle: "Chief Product Officer", departmentId: execDept, managerUserId: ceo });
  await ensureEmployee(cto, { jobTitle: "Chief Technology Officer", departmentId: execDept, managerUserId: ceo });

  // Marketing (Diya Iyer / CMO → Sneha Reddy / Head of Marketing → ICs)
  await ensureEmployee(mgrMarketing, { jobTitle: "Head of Marketing", departmentId: marketingDept, managerUserId: cmo });
  await ensureEmployee(seoLead,     { jobTitle: "SEO Lead",              departmentId: marketingDept, managerUserId: mgrMarketing });
  await ensureEmployee(contentMgr,  { jobTitle: "Content Marketing Manager", departmentId: marketingDept, managerUserId: mgrMarketing });
  await ensureEmployee(designer,     { jobTitle: "Visual Designer",         departmentId: marketingDept, managerUserId: mgrMarketing });

  // Engineering (Rahul / CTO → Priya / Engineering Manager → Leads → ICs)
  await ensureEmployee(mgrEng,         { jobTitle: "Engineering Manager", departmentId: engDept, managerUserId: cto });
  await ensureEmployee(headBackend,   { jobTitle: "Head of Backend",     departmentId: engDept, managerUserId: mgrEng });
  await ensureEmployee(backendEng,    { jobTitle: "Backend Engineer",    departmentId: engDept, managerUserId: headBackend });
  await ensureEmployee(backendEng2,   { jobTitle: "Backend Engineer",    departmentId: engDept, managerUserId: headBackend });
  await ensureEmployee(headFrontend,  { jobTitle: "Head of Frontend",    departmentId: engDept, managerUserId: mgrEng });
  await ensureEmployee(frontendEng,   { jobTitle: "Frontend Engineer",   departmentId: engDept, managerUserId: headFrontend });
  await ensureEmployee(qaSpecialist,  { jobTitle: "QA Specialist",       departmentId: engDept, managerUserId: mgrEng });

  // IT (Vikram / COO → Devansh / IT Lead → specialists)
  await ensureEmployee(mgrIT,         { jobTitle: "Head of IT",          departmentId: itDept, managerUserId: coo });
  await ensureEmployee(itSpecialist,  { jobTitle: "IT Specialist",       departmentId: itDept, managerUserId: mgrIT });
  await ensureEmployee(itSupport,     { jobTitle: "IT Support",          departmentId: itDept, managerUserId: mgrIT });

  // Operations (Vikram / COO → Krishna / Head of Ops → Finance)
  await ensureEmployee(mgrOps,         { jobTitle: "Head of Operations", departmentId: opsDept, managerUserId: coo });
  await ensureEmployee(financeLead,    { jobTitle: "Finance Lead",        departmentId: opsDept, managerUserId: mgrOps });
  await ensureEmployee(financeAnalyst, { jobTitle: "Finance Analyst",     departmentId: opsDept, managerUserId: financeLead });

  // Product (Anjali / CPO → Saanvi / Head of Product → ICs)
  await ensureEmployee(mgrProduct,     { jobTitle: "Head of Product",    departmentId: productDept, managerUserId: cpo });
  await ensureEmployee(productAnalyst, { jobTitle: "Product Analyst",     departmentId: productDept, managerUserId: mgrProduct });
  await ensureEmployee(uxResearcher,   { jobTitle: "UX Researcher",      departmentId: productDept, managerUserId: mgrProduct });

  // Customer Experience (Asha / CEO → Aaradhya / Head of CX → Leads → ICs)
  await ensureEmployee(mgrCX,         { jobTitle: "Head of Customer Experience", departmentId: cxDept, managerUserId: ceo });
  await ensureEmployee(csmLead,       { jobTitle: "Customer Success Manager", departmentId: cxDept, managerUserId: mgrCX });
  await ensureEmployee(supportLead,   { jobTitle: "Support Team Lead",   departmentId: cxDept, managerUserId: mgrCX });
  await ensureEmployee(supportAgent,  { jobTitle: "Customer Support Specialist", departmentId: cxDept, managerUserId: supportLead });

  // Leave types + balances
  const year = new Date().getFullYear();
  async function ensureLeaveType(name: string, quota: string, paid: boolean) {
    const found = await db
      .select({ id: leaveTypes.id })
      .from(leaveTypes)
      .where(and(eq(leaveTypes.organizationId, org.id), eq(leaveTypes.name, name)))
      .limit(1);
    if (found[0]) return found[0].id;
    const lt = await db
      .insert(leaveTypes)
      .values({ organizationId: org.id, name, annualQuotaDays: quota, paid })
      .returning({ id: leaveTypes.id })
      .then(first);
    return lt.id;
  }
  const annual = await ensureLeaveType("Annual Leave", "24", true);
  const sick = await ensureLeaveType("Sick Leave", "12", true);

  for (const userId of [ceo, hr, manager, employee]) {
    for (const lt of [annual, sick]) {
      await db
        .insert(leaveBalances)
        .values({
          organizationId: org.id,
          userId,
          leaveTypeId: lt,
          year,
          entitledDays: lt === annual ? "24" : "12",
          usedDays: "0",
        })
        .onConflictDoNothing();
    }
  }

  // One pending request so the approval center has something to show
  const pendingExists = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.organizationId, org.id), eq(leaveRequests.status, "pending")))
    .limit(1);
  if (!pendingExists[0]) {
    const start = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
    await db.insert(leaveRequests).values({
      organizationId: org.id,
      userId: employee,
      leaveTypeId: annual,
      startDate: start,
      endDate: end,
      days: "3",
      reason: "Family function",
    });
  }

  // One open attendance record for the demo employee
  const openAttendance = await db
    .select({ id: attendanceRecords.id })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.userId, employee)))
    .limit(1);
  if (!openAttendance[0]) {
    await db.insert(attendanceRecords).values({ organizationId: org.id, userId: employee });
  }

  // Request types for the generic Request Center (schema-driven forms)
  const requestTypeSeeds: {
    key: string;
    name: string;
    description: string;
    fields: RequestTypeField[];
    approverMode: string;
  }[] = [
    {
      key: "it_access",
      name: "IT Access",
      description: "Request access to a system or tool",
      fields: [
        { key: "system", label: "System", type: "text", required: true },
        { key: "justification", label: "Justification", type: "textarea", required: true },
        { key: "duration", label: "Duration", type: "select", required: true, options: ["Permanent", "30 days", "7 days"] },
      ],
      approverMode: "manager",
    },
    {
      key: "equipment",
      name: "Equipment",
      description: "Request hardware or equipment",
      fields: [
        { key: "item", label: "Item", type: "text", required: true },
        { key: "reason", label: "Reason", type: "textarea", required: true },
        { key: "cost_estimate", label: "Estimated cost", type: "number" },
        { key: "needed_by", label: "Needed by", type: "date" },
      ],
      approverMode: "company",
    },
    {
      key: "expense",
      name: "Expense Claim",
      description: "Claim reimbursement for a business expense",
      fields: [
        { key: "category", label: "Category", type: "select", required: true, options: ["Travel", "Meals", "Software", "Office supplies", "Other"] },
        { key: "amount", label: "Amount", type: "number", required: true },
        { key: "expense_date", label: "Expense date", type: "date", required: true },
        { key: "notes", label: "Notes / receipt reference", type: "textarea" },
      ],
      approverMode: "manager",
    },
    {
      key: "travel",
      name: "Travel Request",
      description: "Request approval for business travel",
      fields: [
        { key: "destination", label: "Destination", type: "text", required: true },
        { key: "purpose", label: "Purpose", type: "textarea", required: true },
        { key: "start_date", label: "Departure", type: "date", required: true },
        { key: "end_date", label: "Return", type: "date", required: true },
        { key: "estimated_cost", label: "Estimated cost", type: "number" },
      ],
      approverMode: "manager",
    },
    {
      key: "purchase",
      name: "Purchase Request",
      description: "Request approval for a purchase order",
      fields: [
        { key: "item_or_service", label: "Item or service", type: "text", required: true },
        { key: "vendor", label: "Vendor", type: "text" },
        { key: "amount", label: "Amount", type: "number", required: true },
        { key: "business_justification", label: "Business justification", type: "textarea", required: true },
      ],
      approverMode: "company",
    },
  ];

  for (const rt of requestTypeSeeds) {
    const found = await db
      .select({ id: requestTypes.id })
      .from(requestTypes)
      .where(and(eq(requestTypes.organizationId, org.id), eq(requestTypes.key, rt.key)))
      .limit(1);
    if (!found[0]) {
      await db.insert(requestTypes).values({
        organizationId: org.id,
        key: rt.key,
        name: rt.name,
        description: rt.description,
        fields: [...rt.fields],
        approverMode: rt.approverMode,
      });
    }
  }

  // One pending generic request so the approval center shows both kinds
  const pendingReqExists = await db
    .select({ id: requests.id })
    .from(requests)
    .where(and(eq(requests.organizationId, org.id), eq(requests.status, "pending")))
    .limit(1);
  if (!pendingReqExists[0]) {
    const itAccess = await db
      .select({ id: requestTypes.id })
      .from(requestTypes)
      .where(and(eq(requestTypes.organizationId, org.id), eq(requestTypes.key, "it_access")))
      .then(first);
    if (itAccess) {
      await db.insert(requests).values({
        organizationId: org.id,
        typeId: itAccess.id,
        requesterId: employee,
        payload: { system: "Figma", justification: "Design reviews with the product team", duration: "Permanent" },
      });
    }
  }

  // Welcome article so Knowledge isn't empty
  const articleExists = await db
    .select({ id: knowledgeArticles.id })
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.organizationId, org.id))
    .limit(1);
  if (!articleExists[0]) {
    await db.insert(knowledgeArticles).values({
      organizationId: org.id,
      authorUserId: hr,
      title: "Welcome to Wamiro",
      tags: ["handbook", "onboarding"],
      body: [
        "This is your company's knowledge base. Everything published here is searchable from the command palette (Ctrl/Cmd + K).",
        "",
        "Quick start:",
        "1. Clock in from Home when you start your day.",
        "2. Apply for leave under Leave — your manager is notified instantly.",
        "3. Need a tool or equipment? Submit it under Requests.",
        "4. Company files live in Documents; personal ones stay private to you.",
        "",
        "HR and Admins can publish articles here by clicking “New article”.",
      ].join("\n"),
    });
  }

  // Sample project + tasks so My Work / Projects demo immediately
  const projectExists = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.organizationId, org.id), eq(projects.name, "Website Refresh")))
    .limit(1);
  if (!projectExists[0]) {
    const inserted = await db
      .insert(projects)
      .values({
        organizationId: org.id,
        name: "Website Refresh",
        description: "Q3 marketing site overhaul",
        createdBy: manager,
      })
      .returning({ id: projects.id });
    const proj = inserted[0];
    if (!proj) throw new Error("Insert returned no row");
    await db.insert(projectMembers).values([
      { projectId: proj.id, userId: manager },
      { projectId: proj.id, userId: employee },
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await db.insert(tasks).values([
      {
        organizationId: org.id,
        projectId: proj.id,
        title: "Draft new homepage copy",
        assigneeId: employee,
        createdBy: manager,
        priority: "high",
        dueDate: nextWeek,
      },
      {
        organizationId: org.id,
        projectId: proj.id,
        title: "Review analytics tracking plan",
        assigneeId: manager,
        createdBy: manager,
        status: "in_progress",
        dueDate: today,
      },
      {
        organizationId: org.id,
        projectId: null,
        title: "Prepare 1:1 notes",
        assigneeId: manager,
        createdBy: manager,
      },
    ]);
  }

  // Sample company goal
  const goalExists = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.organizationId, org.id), eq(goals.title, "Reach 100 paying customers")))
    .limit(1);
  if (!goalExists[0]) {
    await db.insert(goals).values({
      organizationId: org.id,
      title: "Reach 100 paying customers",
      description: "Company-wide sales objective for the year",
      ownerId: ceo,
      progress: 40,
      dueDate: `${year}-12-31`,
    });
  }

  console.log("Seed complete. Demo logins (password: %s)", DEMO_PASSWORD);
  console.log("  ceo@howdy.test · hr@howdy.test · manager@howdy.test · employee@howdy.test");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
