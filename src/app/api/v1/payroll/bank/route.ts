import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { setBankDetails } from "@/modules/payroll/service";

const schema = z.object({
  employeeUserId: z.string().uuid(),
  bankName: z.string().max(120).optional(),
  bankAccountNo: z.string().max(40).optional(),
  ifscCode: z.string().max(20).optional(),
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid bank details", parsed.error.flatten());
  return NextResponse.json(await setBankDetails(auth, parsed.data));
});
