import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { subscriptionView } from "@/modules/billing/service";

/**
 * The authenticated org's subscription: plan tier, billing status, trial
 * countdown, seat usage vs limit. Any signed-in employee may view it.
 */
export const GET = route(async (_req, { auth }) => {
  return NextResponse.json(await subscriptionView(auth));
});