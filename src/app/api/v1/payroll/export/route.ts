import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { bankRows } from "@/modules/payroll/service";

export const GET = route(async (req: NextRequest, { auth, meta }) => {
  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) throw ApiError.badRequest("runId is required");
  const rows = await bankRows(auth, runId);

  const esc = (v: string | null | undefined) => {
    const s = (v ?? "").replace(/"/g, '""');
    return `"${s}"`;
  };
  const csv = [
    ["employee_name", "employee_code", "bank_name", "bank_account_no", "ifsc_code", "net_amount"].join(","),
    ...rows.map((r) =>
      [r.employeeName, r.employeeCode, r.bankName, r.bankAccountNo, r.ifscCode, r.net.toFixed(2)]
        .map((v) => esc(v))
        .join(","),
    ),
  ].join("\n");

  await audit({
    organizationId: auth.user.organizationId,
    actorUserId: auth.user.id,
    action: "PAYROLL_BANK_EXPORTED",
    entityType: "payroll_run",
    entityId: runId,
    newValue: { rows: rows.length },
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${runId.slice(0, 8)}.csv"`,
    },
  });
});
