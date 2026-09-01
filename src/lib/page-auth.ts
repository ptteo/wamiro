import { redirect } from "next/navigation";

import { loadAuthContext, readSessionToken, type AuthContext } from "./session";
import { can } from "@/modules/iam/engine";

/** Server-component guard: redirects to /login when unauthenticated. */
export async function requireAuthPage(): Promise<AuthContext> {
  const token = await readSessionToken();
  if (!token) redirect("/login");
  try {
    return await loadAuthContext(token);
  } catch {
    redirect("/login");
  }
}

export { can };
