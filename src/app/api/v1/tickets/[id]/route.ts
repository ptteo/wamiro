import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { assignTicket, getTicket, linkKnowledge, updateStatus } from "@/modules/tickets/service";

export const GET = route(async (_req: NextRequest, { auth, params }) => {
  const id = params["id"] ?? "";
  return NextResponse.json(await getTicket(auth, id));
});

const patchSchema = z
  .object({
    status: z.enum(["new", "open", "waiting", "resolved", "closed"]).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    relatedKnowledgeIds: z.array(z.string().uuid()).max(20).optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined || v.assigneeId !== undefined || v.relatedKnowledgeIds !== undefined,
    { message: "Provide status, assigneeId or relatedKnowledgeIds" },
  );

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Ticket id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid update", parsed.error.flatten());
    if (parsed.data.status !== undefined) {
      await updateStatus(auth, id, parsed.data.status);
    }
    if (parsed.data.assigneeId !== undefined) {
      await assignTicket(auth, id, parsed.data.assigneeId);
    }
    if (parsed.data.relatedKnowledgeIds !== undefined) {
      await linkKnowledge(auth, id, parsed.data.relatedKnowledgeIds);
    }
    return NextResponse.json({ ok: true });
  },
);