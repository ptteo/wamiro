import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { getForDownload } from "@/modules/documents/service";

/**
 * Authorized download: permission + ownership checks run BEFORE any byte is
 * read from storage. The storage key never reaches the client.
 */
export const GET = route(async (_req: NextRequest, { auth, params }) => {
  const id = params["id"];
  if (!id) throw ApiError.badRequest("Document id required");
  const doc = await getForDownload(auth, id);
  const safeName = doc.fileName.replace(/[^\w .()-]/g, "_");
  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.sizeBytes),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
