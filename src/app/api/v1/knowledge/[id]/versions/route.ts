import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { listVersions, restoreVersion } from "@/modules/knowledge/service";

/** Phase 8 — version history for an article. */
export const GET = route(
  async (_req, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Article id required");
    return NextResponse.json({ versions: await listVersions(auth, id) });
  },
  { permission: "knowledge.manage" },
);

const restoreSchema = z.object({ versionId: z.string().uuid() });

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Article id required");
    const parsed = restoreSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("versionId required", parsed.error.flatten());
    await restoreVersion(auth, id, parsed.data.versionId);
    return NextResponse.json({ ok: true });
  },
  { permission: "knowledge.manage" },
);
