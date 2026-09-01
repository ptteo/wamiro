import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { syncEmployees } from "@/modules/integrations/frappe";

/** Pull the employee master from Frappe HR into Wamiro. */
export const POST = route(
  async (_req, { auth }) => {
    const result = await syncEmployees(auth);
    return NextResponse.json({ ok: true, ...result });
  },
  { permission: "roles.manage" },
);
