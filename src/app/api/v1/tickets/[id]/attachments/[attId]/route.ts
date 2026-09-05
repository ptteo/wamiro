import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { getForDownload, removeAttachment } from "@/modules/tickets/attachments";

export const GET = route(async (_req: NextRequest, { auth, params }) => {
  const attId = params["attId"] ?? "";
  if (!attId) throw ApiError.badRequest("Attachment id required");
  const file = await getForDownload(auth, attId);
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file.fileName.replace(/["\\]/g, "_")}"`,
      "Content-Length": String(file.data.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
});

export const DELETE = route(
  async (_req: NextRequest, { auth, params }) => {
    const attId = params["attId"] ?? "";
    if (!attId) throw ApiError.badRequest("Attachment id required");
    await removeAttachment(auth, attId);
    return NextResponse.json({ ok: true });
  },
);