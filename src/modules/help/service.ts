import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { can } from "@/modules/iam/engine";
import { createTicketRecord } from "@/modules/tickets/service";
import { list as listKnowledge } from "@/modules/knowledge/service";
import { helpArticlesFor, searchHelpArticles } from "./catalog";

export async function helpPageData(ctx: AuthContext) {
  const articles = helpArticlesFor(ctx.roleKeys);
  const kb = can(ctx.access, "knowledge.view")
    ? (await listKnowledge(ctx, 8)).map((a) => ({ id: a.id, title: a.title, href: `/knowledge?article=${a.id}` }))
    : [];
  return { articles, kb };
}

export async function searchHelp(ctx: AuthContext, query: string) {
  const curated = searchHelpArticles(query, ctx.roleKeys);
  let knowledge: { id: string; title: string; snippet: string }[] = [];
  if (can(ctx.access, "knowledge.view")) {
    const { searchArticles } = await import("@/modules/knowledge/service");
    const hits = await searchArticles(ctx.user.organizationId, query.toLowerCase().replace(/[%_]/g, ""), query, 5);
    knowledge = hits.map((h) => ({ id: h.id, title: h.title, snippet: h.subtitle ?? "" }));
  }
  return { curated, knowledge };
}

export async function createPlatformSupportTicket(
  ctx: AuthContext,
  input: { title: string; description: string },
) {
  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 3) throw ApiError.badRequest("Subject is too short");
  if (description.length < 5) throw ApiError.badRequest("Please describe what happened");
  const row = await createTicketRecord(ctx.user.organizationId, ctx.user.id, {
    title,
    description,
    category: "platform",
    priority: "medium",
  });
  return row;
}
