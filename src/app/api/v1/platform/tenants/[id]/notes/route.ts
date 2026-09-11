import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createNote, deleteNote, listNotes, updateNote } from "@/modules/platform/crm";

/** Phase C — CRM-lite notes for a tenant (platform schema, operator-only). */
export const GET = route(
  async (_req, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Organization id required");
    return NextResponse.json({ notes: await listNotes(auth, id) });
  },
  { permission: "platform.admin" },
);

const createSchema = z.object({ body: z.string().trim().min(2).max(5000), pinned: z.boolean().optional() });

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Organization id required");
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid note", parsed.error.flatten());
    const row = await createNote(auth, id, parsed.data);
    return NextResponse.json({ ok: true, note: row }, { status: 201 });
  },
  { permission: "platform.admin" },
);

const patchBodySchema = z.object({
  noteId: z.string().uuid(),
  pinned: z.boolean().optional(),
  body: z.string().trim().min(2).max(5000).optional(),
});

/** PATCH pins/edits; DELETE ?noteId= removes. */
export const PATCH = route(
  async (req: NextRequest, { auth }) => {
    const parsed = patchBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid note patch", parsed.error.flatten());
    await updateNote(auth, parsed.data.noteId, { pinned: parsed.data.pinned, body: parsed.data.body });
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);

export const DELETE = route(
  async (req: NextRequest, { auth }) => {
    const noteId = req.nextUrl.searchParams.get("noteId");
    if (!noteId) throw ApiError.badRequest("noteId required");
    await deleteNote(auth, noteId);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);
