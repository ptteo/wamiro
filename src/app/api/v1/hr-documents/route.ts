import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { listDocs, upload } from "@/modules/people/hr-documents";

export const GET = route(async (req: NextRequest, { auth }) => {
  const employeeUserId = req.nextUrl.searchParams.get("employeeId") ?? undefined;
  const result = await listDocs(auth, { employeeUserId });
  return NextResponse.json({
    docs: result.docs.map((d) => ({
      id: d.id,
      employeeUserId: d.employeeUserId,
      employeeName: d.employeeName,
      docType: d.docType,
      title: d.title,
      mimeType: d.mimeType,
      sizeBytes: Number(d.sizeBytes),
      expiresAt: d.expiresAt !== null ? String(d.expiresAt) : null,
      uploadedByName: d.uploadedByName,
      createdAt: d.createdAt.toISOString(),
    })),
    canManageAll: result.canManageAll,
  });
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw ApiError.badRequest("multipart/form-data body expected");
  const file = form.get("file");
  if (!(file instanceof File)) throw ApiError.badRequest("file field required");
  if (file.size > 25 * 1024 * 1024) throw ApiError.badRequest("File exceeds the 25 MB limit");

  const row = await upload(auth, {
    employeeUserId: (form.get("employeeUserId") as string) || auth.user.id,
    docType: (form.get("docType") as string) ?? "other",
    title: (form.get("title") as string) ?? file.name,
    expiresAt: (form.get("expiresAt") as string | null) || null,
    mimeType: file.type || undefined,
    fileName: file.name,
    data: Buffer.from(await file.arrayBuffer()),
  });
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
});
