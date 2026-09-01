import { redirect } from "next/navigation";

import { readSessionToken } from "@/lib/session";

export default async function RootPage() {
  const token = await readSessionToken();
  redirect(token ? "/home" : "/login");
}
