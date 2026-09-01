import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createControl, createObligation, createPolicy, createRisk, listAll, setControlResult, setObligationStatus, setPolicyStatus, setRiskStatus } from "@/modules/governance/service";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json(await listAll(auth));
  },
  { permission: "governance.view" },
);

const policySchema = z.object({
  type: z.literal("policy"),
  title: z.string().min(2).max(200),
  status: z.string().max(20).optional(),
  effectiveAt: z.string().max(10).optional(),
  reviewAt: z.string().max(10).optional(),
});
const obligationSchema = z.object({
  type: z.literal("obligation"),
  title: z.string().min(2).max(200),
  dueAt: z.string().max(10).optional(),
  notes: z.string().max(2000).optional(),
});
const controlSchema = z.object({
  type: z.literal("control"),
  name: z.string().min(2).max(200),
  description: z.string().max(3000).optional(),
});
const riskSchema = z.object({
  type: z.literal("risk"),
  title: z.string().min(2).max(200),
  category: z.string().max(60).optional(),
  impact: z.string().max(12).optional(),
  likelihood: z.string().max(12).optional(),
  mitigation: z.string().max(3000).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const body = await req.json().catch(() => null);
    if (body?.type === "risk") {
      const parsed = riskSchema.safeParse(body);
      if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
      const id = await createRisk(auth, parsed.data);
      return NextResponse.json({ ok: true, id }, { status: 201 });
    }
    if (body?.type === "obligation") {
      const o = obligationSchema.safeParse(body);
      if (!o.success) throw ApiError.badRequest("Check the form", o.error.flatten());
      const oid = await createObligation(auth, o.data);
      return NextResponse.json({ ok: true, id: oid }, { status: 201 });
    }
    if (body?.type === "control") {
      const ct = controlSchema.safeParse(body);
      if (!ct.success) throw ApiError.badRequest("Check the form", ct.error.flatten());
      const cid = await createControl(auth, ct.data);
      return NextResponse.json({ ok: true, id: cid }, { status: 201 });
    }
    const parsed = policySchema.safeParse(body);
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    const id = await createPolicy(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "governance.manage" },
);


const patchSchema = z.object({
  kind: z.enum(["policy", "risk", "control", "obligation"]),
  id: z.string().uuid(),
  status: z.string().min(3).max(20),
  result: z.string().min(3).max(20).optional(),
});

export const PATCH = route(
  async (req: NextRequest, { auth }) => {
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid payload");
    if (parsed.data.kind === "control") {
      await setControlResult(auth, parsed.data.id, { status: (parsed.data as { status?: string }).status, result: (parsed.data as { result?: string }).result });
      return NextResponse.json({ ok: true });
    }
    if (parsed.data.kind === "obligation") {
      await setObligationStatus(auth, parsed.data.id, parsed.data.status);
      return NextResponse.json({ ok: true });
    }
    if (parsed.data.kind === "policy") await setPolicyStatus(auth, parsed.data.id, parsed.data.status);
    else await setRiskStatus(auth, parsed.data.id, parsed.data.status);
    return NextResponse.json({ ok: true });
  },
  { permission: "governance.manage" },
);
