/**
 * Org chart: reporting-line tree for the whole tenant.
 * Requires company-wide directory visibility (employees.view @ COMPANY+).
 */
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/session";
import { departments, employees, users } from "@/db/schema";
import { widestScope } from "@/modules/iam/engine";

export interface OrgNode {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  title: string | null;
  departmentId: string | null;
  departmentName: string | null;
  managerUserId: string | null;
  children: OrgNode[];
}

export interface OrgDepartment {
  id: string;
  name: string;
  count: number;
}

export interface OrgData {
  tree: OrgNode[];
  /** All active people, flat, for the focus/profile view. */
  byId: Map<string, OrgNode>;
  /** Department roll-up. */
  departments: OrgDepartment[];
  totalPeople: number;
  totalRoots: number;
  maxDepth: number;
}

export async function orgData(ctx: AuthContext): Promise<OrgData | null> {
  const scope = widestScope(ctx.access, "employees.view");
  if (scope !== "COMPANY" && scope !== "GLOBAL") return null;

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      title: employees.jobTitle,
      departmentId: employees.departmentId,
      managerUserId: employees.managerUserId,
      departmentName: departments.name,
    })
    .from(users)
    .leftJoin(employees, eq(employees.userId, users.id))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(and(eq(users.organizationId, ctx.user.organizationId), eq(users.status, "active")))
    .orderBy(asc(users.name));

  if (rows.length === 0) {
    return { tree: [], byId: new Map(), departments: [], totalPeople: 0, totalRoots: 0, maxDepth: 0 };
  }

  const nodes = new Map<string, OrgNode>();
  for (const r of rows) {
    nodes.set(r.userId, {
      userId: r.userId,
      name: r.name,
      email: r.email,
      avatarUrl: r.avatarUrl,
      title: r.title,
      departmentId: r.departmentId,
      departmentName: r.departmentName,
      managerUserId: r.managerUserId,
      children: [],
    });
  }

  /** Is `candidate` an ancestor of `start` (within 100 hops)? Cycle guard. */
  function hasAncestor(startId: string, candidateId: string): boolean {
    let current = rows.find((r) => r.userId === startId);
    for (let hops = 0; hops < 100 && current?.managerUserId; hops++) {
      if (current.managerUserId === candidateId) return true;
      current = rows.find((r) => r.userId === current!.managerUserId);
    }
    return false;
  }

  const roots: OrgNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.userId)!;
    let attached = false;
    if (r.managerUserId && r.managerUserId !== r.userId && !hasAncestor(r.managerUserId, r.userId)) {
      const parent = nodes.get(r.managerUserId);
      if (parent) {
        parent.children.push(node);
        attached = true;
      }
    }
    if (!attached) roots.push(node);
  }
  roots.sort((a, b) => a.name.localeCompare(b.name));

  // Department roll-up
  const deptCounts = new Map<string, { id: string; name: string; count: number }>();
  for (const r of rows) {
    if (!r.departmentId || !r.departmentName) continue;
    const key = r.departmentId;
    const cur = deptCounts.get(key);
    if (cur) {
      cur.count += 1;
    } else {
      deptCounts.set(key, { id: key, name: r.departmentName, count: 1 });
    }
  }
  const departmentRollup = Array.from(deptCounts.values()).sort((a, b) => b.count - a.count);

  // Compute max depth from the tree
  let maxDepth = 0;
  const stack: Array<{ node: OrgNode; depth: number }> = roots.map((r) => ({ node: r, depth: 1 }));
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (depth > maxDepth) maxDepth = depth;
    stack.push(...node.children.map((c) => ({ node: c, depth: depth + 1 })));
  }

  return {
    tree: roots,
    byId: nodes,
    departments: departmentRollup,
    totalPeople: rows.length,
    totalRoots: roots.length,
    maxDepth,
  };
}

/** Legacy wrapper kept for the previous call site. Returns just the tree. */
export async function orgTree(ctx: AuthContext): Promise<OrgNode[] | null> {
  const data = await orgData(ctx);
  return data ? data.tree : null;
}

