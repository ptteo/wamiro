import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { connectMailbox, listMailboxes } from "@/modules/mailboxes/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ mailboxes: await listMailboxes(auth) });
});

const connectSchema = z.object({
  email: z.string().email().max(200),
  imapHost: z.string().min(1).max(200),
  imapPort: z.number().int().min(1).max(65535).default(993),
  imapUser: z.string().min(1).max(200),
  imapPass: z.string().min(1).max(500),
  useSsl: z.boolean().default(true),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = connectSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid mailbox config", parsed.error.flatten());
    const row = await connectMailbox(auth, parsed.data);
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
);