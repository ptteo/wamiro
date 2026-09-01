/**
 * Global search: people, knowledge, documents, discussions, announcements.
 * Postgres ILIKE is plenty at tenant scale; swap for tsvector/Meilisearch
 * when fuzzy/typo-tolerance matters.
 */
import { and, asc, eq, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/session";
import {
  announcements,
  candidates,
  departments,
  discussions,
  documents,
  employees,
  users,
  vendors,
} from "@/db/schema";
import { can, widestScope } from "@/modules/iam/engine";
import { searchArticles } from "@/modules/knowledge/service";

export type SearchResult =
  | { type: "person"; id: string; title: string; subtitle: string; href: string }
  | { type: "article"; id: string; title: string; subtitle: string; href: string }
  | { type: "document"; id: string; title: string; subtitle: string; href: string }
  | { type: "announcement"; id: string; title: string; subtitle: string; href: string }
  | { type: "discussion"; id: string; title: string; subtitle: string; href: string }
  | { type: "vendor"; id: string; title: string; subtitle: string; href: string }
  | { type: "candidate"; id: string; title: string; subtitle: string; href: string };

function escapeLike(q: string): string {
  return q.trim().replace(/[\\%_]/g, "\\$&");
}

export async function search(ctx: AuthContext, rawQuery: string): Promise<SearchResult[]> {
  const q = escapeLike(rawQuery);
  if (q.length < 2) return [];

  const results: SearchResult[] = [];
  const like = `%${q.replace(/[%_\\]/g, "")}%`;

  // --- knowledge articles (semantic when embeddings configured, keyword otherwise) ---
  if (can(ctx.access, "knowledge.view")) {
    const arts = await searchArticles(ctx.user.organizationId, q.replace(/[%_\\]/g, ""), rawQuery.trim(), 3);
    for (const a of arts) {
      results.push({ type: "article", id: a.id, title: a.title, subtitle: a.subtitle, href: `/knowledge?id=${a.id}` });
    }
  }

  // --- people ---
  if (can(ctx.access, "employees.view")) {
    results.push(...(await searchPeople(ctx, like)));
  }

  // --- documents (fileName ILIKE, tenant-scoped, personal docs restricted) ---
  if (can(ctx.access, "documents.view")) {
    results.push(...(await searchDocuments(ctx, like)));
  }

  // --- announcements (title/body ILIKE, tenant-scoped) ---
  if (can(ctx.access, "employees.view")) {
    // reuse people gate as "is the user in the org enough to read announcements"
    results.push(...(await searchAnnouncements(ctx, like)));
  }

  // --- discussions (title/body ILIKE, tenant-scoped) ---
  results.push(...(await searchDiscussions(ctx, like)));

  // --- D12/D13: vendors + candidates (permission-gated) ---
  if (can(ctx.access, "finance.manage_vendors")) {
    results.push(...(await searchVendors(ctx, like)));
  }
  if (can(ctx.access, "recruitment.manage")) {
    results.push(...(await searchCandidates(ctx, like)));
  }

  return results.slice(0, 10);
}

async function searchPeople(ctx: AuthContext, q: string): Promise<SearchResult[]> {
  const like = `%${q}%`;
  const scope = widestScope(ctx.access, "employees.view");
  const companyWide = scope === "COMPANY" || scope === "GLOBAL" || scope === "DEPARTMENT";

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      jobTitle: employees.jobTitle,
      departmentName: departments.name,
    })
    .from(users)
    .leftJoin(employees, eq(employees.userId, users.id))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(
      and(
        eq(users.organizationId, ctx.user.organizationId),
        eq(users.status, "active"),
        or(
          sql`${users.name} ILIKE ${like}`,
          sql`${users.email} ILIKE ${like}`,
          sql`COALESCE(${employees.jobTitle}, '') ILIKE ${like}`,
        ),
        // TEAM-scope viewers only find their own reports
        companyWide
          ? undefined
          : sql`(${users.id} = ${ctx.user.id} OR ${users.id} IN (
              SELECT user_id FROM employees WHERE manager_user_id = ${ctx.user.id}
            ))`,
      ),
    )
    .orderBy(asc(users.name))
    .limit(8);

  return rows.map((r) => ({
    type: "person" as const,
    id: r.id,
    title: r.name,
    subtitle: [r.jobTitle, r.departmentName].filter(Boolean).join(" · ") || r.email,
    href: `/people/${r.id}`,
  }));
}

async function searchDocuments(ctx: AuthContext, like: string): Promise<SearchResult[]> {
  const isManager = can(ctx.access, "documents.manage");
  const rows = await db
    .select({
      id: documents.id,
      name: documents.fileName,
      uploaderName: users.name,
    })
    .from(documents)
    .innerJoin(users, eq(users.id, documents.uploadedBy))
    .where(
      and(
        eq(documents.organizationId, ctx.user.organizationId),
        sql`${documents.fileName} ILIKE ${like}`,
        isManager
          ? undefined
          : or(
              eq(documents.category, "company"),
              eq(documents.category, "policy"),
              eq(documents.ownerUserId, ctx.user.id),
              eq(documents.uploadedBy, ctx.user.id),
            ),
      ),
    )
    .orderBy(asc(documents.fileName))
    .limit(3);
  return rows.map((r) => ({
    type: "document" as const,
    id: r.id,
    title: r.name,
    subtitle: r.uploaderName ? `Uploaded by ${r.uploaderName}` : "Document",
    href: `/documents`,
  }));
}

async function searchAnnouncements(ctx: AuthContext, like: string): Promise<SearchResult[]> {
  const rows = await db
    .select({ id: announcements.id, title: announcements.title, body: announcements.body })
    .from(announcements)
    .where(
      and(
        eq(announcements.organizationId, ctx.user.organizationId),
        or(
          sql`${announcements.title} ILIKE ${like}`,
          sql`${announcements.body} ILIKE ${like}`,
        ),
      ),
    )
    .orderBy(asc(announcements.title))
    .limit(3);
  return rows.map((r) => ({
    type: "announcement" as const,
    id: r.id,
    title: r.title,
    subtitle: r.body.length > 80 ? r.body.slice(0, 80) + "…" : r.body,
    href: `/announcements`,
  }));
}

async function searchDiscussions(ctx: AuthContext, like: string): Promise<SearchResult[]> {
  const rows = await db
    .select({ id: discussions.id, title: discussions.title, body: discussions.body })
    .from(discussions)
    .where(
      and(
        eq(discussions.organizationId, ctx.user.organizationId),
        or(
          sql`${discussions.title} ILIKE ${like}`,
          sql`${discussions.body} ILIKE ${like}`,
        ),
      ),
    )
    .orderBy(asc(discussions.title))
    .limit(3);
  return rows.map((r) => ({
    type: "discussion" as const,
    id: r.id,
    title: r.title,
    subtitle: r.body.length > 80 ? r.body.slice(0, 80) + "…" : r.body,
    href: `/discussions`,
  }));
}

async function searchVendors(ctx: AuthContext, like: string): Promise<SearchResult[]> {
  const rows = await db
    .select({ id: vendors.id, name: vendors.name, status: vendors.status })
    .from(vendors)
    .where(and(eq(vendors.organizationId, ctx.user.organizationId), sql`${vendors.name} ILIKE ${like}`))
    .limit(3);
  return rows.map((r) => ({
    type: "vendor" as const,
    id: r.id,
    title: r.name,
    subtitle: `Vendor · ${r.status}`,
    href: `/finance/vendors/${r.id}`,
  }));
}

async function searchCandidates(ctx: AuthContext, like: string): Promise<SearchResult[]> {
  const rows = await db
    .select({ id: candidates.id, name: candidates.name, stage: candidates.stage })
    .from(candidates)
    .where(
      and(
        eq(candidates.organizationId, ctx.user.organizationId),
        or(sql`${candidates.name} ILIKE ${like}`, sql`COALESCE(${candidates.email}, '') ILIKE ${like}`),
      ),
    )
    .limit(3);
  return rows.map((r) => ({
    type: "candidate" as const,
    id: r.id,
    title: r.name,
    subtitle: `Candidate · ${r.stage}`,
    href: `/people/recruitment/${r.id}`,
  }));
}
