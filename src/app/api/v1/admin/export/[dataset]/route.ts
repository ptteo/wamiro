import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { exportDataset, isDataset } from "@/modules/admin/export";

export const GET = route(
  async (_req: NextRequest, { auth, params }) => {
    const key = params["dataset"];
    if (!key || !isDataset(key)) throw ApiError.badRequest("Unknown dataset");
    const { csv } = await exportDataset(auth, key);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wamiro-${key}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { permission: "data.export" },
);
