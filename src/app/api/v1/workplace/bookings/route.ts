import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { book, cancelBooking, myBookings } from "@/modules/workplace/service";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json({ bookings: await myBookings(auth) });
  },
  { permission: "workplace.book" },
);

const schema = z.object({
  action: z.literal("cancel"),
  id: z.string().uuid(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const body = await req.json().catch(() => null);
    if (body && typeof body === "object" && "action" in body) {
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw ApiError.badRequest("Invalid payload");
      await cancelBooking(auth, parsed.data.id);
      return NextResponse.json({ ok: true });
    }
    const bookSchema = z.object({
      resourceId: z.string().uuid(),
      startsAt: z.string().min(10),
      endsAt: z.string().min(10),
    });
    const parsed = bookSchema.safeParse(body);
    if (!parsed.success) throw ApiError.badRequest("resourceId + startsAt/endsAt required", parsed.error.flatten());
    const id = await book(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "workplace.book" },
);
