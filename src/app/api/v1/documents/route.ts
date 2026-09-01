import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { listVisible, upload } from "@/modules/documents/service";

export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ documents: await listVisible(auth) });
  },
  { permission: "documents.view" },
);

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const form = await req.formData().catch(() => null);
    if (!form) throw ApiError.badRequest("multipart/form-data body expected");
    const file = form.get("file");
    if (!(file instanceof File)) throw ApiError.badRequest("file field required");
    // §41 file-upload abuse guards: hard size cap + type allow-list
    const MAX_DOC_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_DOC_BYTES) throw ApiError.badRequest("File exceeds the 25 MB limit");
    if (
      file.type &&
      !/^(image|text|video)\//.test(file.type) &&
      !/^application\/(pdf|msword|vnd\.openxmlformats-officedocument|vnd\.ms-excel|json|zip|x-7z-compressed)/.test(file.type)
    ) {
      throw ApiError.badRequest("Unsupported file type");
    }

    const row = await upload(
      auth,
      {
        name: file.name,
        mimeType: file.type,
        data: Buffer.from(await file.arrayBuffer()),
      },
      {
        category: (form.get("category") as string | null) ?? undefined,
        ownerUserId: (form.get("ownerUserId") as string | null) || null,
      },
    );
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
  { permission: "documents.upload" },
);
