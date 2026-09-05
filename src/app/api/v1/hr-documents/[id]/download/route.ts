import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { download } from "@/modules/people/hr-documents";

export const GET = route(async (_req, { auth, params, meta }) => {
  const { buffer, fileName, mimeType } = await download(auth, params["id"] ?? "");
  await audit({
    organizationId: auth.user.organizationId,
    actorUserId: auth.user.id,
    action: "HR_DOCUMENT_DOWNLOADED",
    entityType: "employee_document",
    entityId: params.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
    },
  });
});
