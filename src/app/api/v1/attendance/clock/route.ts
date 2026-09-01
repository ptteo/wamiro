import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { clockToggle } from "@/modules/attendance/service";
import { can } from "@/modules/iam/engine";

export const POST = route(async (_req, { auth, meta }) => {
  if (!can(auth.access, "attendance.view_self")) {
    // attendance module is self-service at minimum for every active member
    return NextResponse.json(
      { error: { code: "forbidden", message: "Attendance module disabled", request_id: meta.requestId } },
      { status: 403 },
    );
  }
  const result = await clockToggle(auth);
  await audit({
    organizationId: auth.user.organizationId,
    actorUserId: auth.user.id,
    action: result.action === "clock_in" ? "ATTENDANCE_CLOCK_IN" : "ATTENDANCE_CLOCK_OUT",
    entityType: "attendance_record",
    entityId: result.record.id,
    newValue: { clockIn: result.record.clockIn, clockOut: result.record.clockOut },
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });
  return NextResponse.json(result);
});
