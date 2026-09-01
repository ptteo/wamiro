import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { addJourneyItem, getJourney, toggleJourneyItem } from "@/modules/people-ops/service";

export const GET = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    return NextResponse.json({ journey: await getJourney(auth, id) });
  },
  { permission: "lifecycle.manage" },
);

const addSchema = z.object({
  action: z.literal("add_item"),
  title: z.string().min(2).max(200),
  kind: z.string().max(20).optional(),
  assigneeUserId: z.string().uuid().optional(),
});

const toggleSchema = z.object({ action: z.literal("toggle_item"), itemId: z.string().uuid(), done: z.boolean() });

const schema = z.union([addSchema, toggleSchema]);

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid payload");
    if (parsed.data.action === "add_item") {
      await addJourneyItem(auth, id, {
        title: parsed.data.title,
        kind: parsed.data.kind,
        assigneeUserId: parsed.data.assigneeUserId,
      });
    } else {
      await toggleJourneyItem(auth, parsed.data.itemId, parsed.data.done);
    }
    return NextResponse.json({ ok: true });
  },
  { permission: "lifecycle.manage" },
);
