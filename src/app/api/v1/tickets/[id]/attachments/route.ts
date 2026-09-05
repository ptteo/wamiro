import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { addAttachment, listForTicket } from "@/modules/tickets/attachments";

export const GET = route(async (_req: NextRequest, { auth, params }) => {
  const ticketId = params["id"] ?? "";
  if (!ticketId) throw ApiError.badRequest("Ticket id required");
  return NextResponse.json({ attachments: await listForTicket(auth, ticketId) });
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const ticketId = params["id"] ?? "";
    if (!ticketId) throw ApiError.badRequest("Ticket id required");
    const form = await req.formData().catch(() => null);
    if (!form) throw ApiError.badRequest("multipart/form-data body expected");
    const file = form.get("file");
    if (!(file instanceof File)) throw ApiError.badRequest("file field required");
    const row = await addAttachment(auth, ticketId, {
      name: file.name,
      mimeType: file.type,
      data: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
);