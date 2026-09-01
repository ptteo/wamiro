import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { notify } from "@/modules/notifications/service";
import { can } from "@/modules/iam/engine";
import { teamMembers, teams, users } from "@/db/schema";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  jobTitle: string | null;
}

export interface TeamRow {
  id: string;
  name: string;
  memberCount: number;
  /** The team's de facto lead — the earliest member, or null if empty. */
  lead: TeamMember | null;
  /** Up to 5 most recent members for the card's stacked-avatar preview. */
  previewMembers: TeamMember[];
  /** All members, sorted by name (used when the card is expanded). */
  members: TeamMember[];
}

/** All teams in the tenant with rich member info. */
export async function listTeams(ctx: AuthContext): Promise<TeamRow[]> {
  // Single SQL pass: project each team with a JSON array of full
  // member records. We then split that array into a preview and a
  // sorted full list on the JS side.
  // The subquery's WHERE filters by the OUTER `teams.id` — we need to
  // qualify it explicitly so Postgres doesn't get confused by the
  // joined `users.id` / `employees.id` columns.
  const memberAgg = sql<
    string
  >`COALESCE((
    SELECT json_agg(json_build_object(
      'userId', u.id,
      'name', u.name,
      'email', u.email,
      'avatarUrl', u.avatar_url,
      'jobTitle', e.job_title
    ) ORDER BY u.name)
    FROM team_members tm
    JOIN users u ON u.id = tm.user_id
    LEFT JOIN employees e ON e.user_id = u.id
    WHERE tm.team_id = ${teams}.id
  ), '[]'::json)::text`.as("members_json");

  const raw = await db
    .select({
      id: teams.id,
      name: teams.name,
      membersJson: memberAgg,
    })
    .from(teams)
    .where(eq(teams.organizationId, ctx.user.organizationId))
    .orderBy(teams.name);

  return raw.map((r) => {
    const members = parseMembers(r.membersJson);
    return {
      id: r.id,
      name: r.name,
      members,
      memberCount: members.length,
      lead: members[0] ?? null,
      previewMembers: members.slice(0, 5),
    };
  });
}

function parseMembers(json: string | null): TeamMember[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as TeamMember[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function createTeam(ctx: AuthContext, name: string) {
  if (!canManage(ctx)) throw ApiError.forbidden("Missing permission: teams.manage");

  const inserted = await db
    .insert(teams)
    .values({ organizationId: ctx.user.organizationId, name: name.trim().slice(0, 80) })
    .returning({ id: teams.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TEAM_CREATED",
    entityType: "team",
    entityId: row.id,
    newValue: { name },
  });
  return row;
}

async function canManage(ctx: AuthContext): Promise<boolean> {
  return can(ctx.access, "teams.manage");
}

async function teamInOrg(orgId: string, teamId: string): Promise<string> {
  const [t] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.organizationId, orgId)))
    .limit(1);
  if (!t) throw ApiError.notFound("Team not found");
  return t.id;
}

export async function addMember(
  ctx: AuthContext,
  teamId: string,
  email: string,
) {
  if (!(await canManage(ctx))) throw ApiError.forbidden("Missing permission: teams.manage");
  const id = await teamInOrg(ctx.user.organizationId, teamId);

  const [user] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      and(eq(users.email, email.trim().toLowerCase()), eq(users.organizationId, ctx.user.organizationId)),
    )
    .limit(1);
  if (!user) throw ApiError.notFound("No user with that email in your organization");

  await db.insert(teamMembers).values({ teamId: id, userId: user.id }).onConflictDoNothing();

  await notify({
    organizationId: ctx.user.organizationId,
    userId: user.id,
    type: "team.member_added",
    title: "You were added to a team",
    link: "/teams",
  });

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TEAM_MEMBER_ADDED",
    entityType: "team",
    entityId: id,
    metadata: { userId: user.id },
  });
}

export async function removeMember(
  ctx: AuthContext,
  teamId: string,
  userEmail: string,
) {
  if (!(await canManage(ctx))) throw ApiError.forbidden("Missing permission: teams.manage");
  const id = await teamInOrg(ctx.user.organizationId, teamId);

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, userEmail.trim().toLowerCase()), eq(users.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!user) throw ApiError.notFound("No user with that email");

  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, user.id)));

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TEAM_MEMBER_REMOVED",
    entityType: "team",
    entityId: id,
    metadata: { userId: user.id },
  });
}

export async function deleteTeam(ctx: AuthContext, teamId: string) {
  if (!(await canManage(ctx))) throw ApiError.forbidden("Missing permission: teams.manage");
  const id = await teamInOrg(ctx.user.organizationId, teamId);
  await db.delete(teams).where(eq(teams.id, id)); // members cascade
  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "TEAM_DELETED",
    entityType: "team",
    entityId: id,
  });
}
