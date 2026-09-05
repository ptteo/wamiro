import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { removeMailbox, updateMailbox } from "@/modules/mailboxes/service";

const patchSchema = z.object({
  email: z.string().email().max(200).optional(),
  imapHost: z.string().min(1).max(200).optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapUser: z.string().min(1).max(200).optional(),
  imapPass: z.string().max(500).optional(),
  useSsl: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Mailbox id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid mailbox config", parsed.error.flatten());
    await updateMailbox(auth, id, parsed.data);
    return NextResponse.json({ ok: true });
  },
);

export const DELETE = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Mailbox id required");
    await removeMailbox(auth, id);
    return NextResponse.json({ ok: true });
  },
);