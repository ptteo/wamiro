"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminSection } from "./admin-ui";
import { Badge, EmptyState, btn } from "./ui";

interface OverrideItem {
  id: string;
  userName: string;
  permission: string;
  effect: "allow" | "deny";
  scope: string;
  reason: string;
  expiresAt: string | null;
}

interface RoleItem {
  userId: string;
  roleId: string;
  roleName: string;
  userName: string;
}

export function AccessReviewsClient({
  overrides,
  elevatedRoles,
}: {
  overrides: OverrideItem[];
  elevatedRoles: RoleItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mutate(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(url + method);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Action failed");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function keep(
    kind: "override" | "role",
    refId: string,
    userName: string,
    detail: string,
  ): Promise<boolean> {
    return mutate("/api/v1/admin/access-reviews", "POST", { kind, refId, userName, detail });
  }

  const total = overrides.length + elevatedRoles.length;

  return (
    <div className="min-w-0 space-y-5">
      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <AdminSection title={`Permission grants (${overrides.length})`}>
        {overrides.length === 0 ? (
          <EmptyState title="No direct grants to review" />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {overrides.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {o.userName}{" "}
                    <Badge tone={o.effect === "deny" ? "red" : "brand"}>
                      {o.effect} · {o.permission}
                    </Badge>
                  </p>
                  <p className="text-xs text-tertiary">
                    scope {o.scope} · {o.reason}
                    {o.expiresAt
                      ? ` · expires ${new Date(o.expiresAt).toLocaleDateString()}`
                      : " · no expiry"}
                  </p>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      keep("override", o.id, o.userName, `${o.effect} ${o.permission}@${o.scope}`)
                    }
                    className={`${btn.success} ${btn.small} flex-1 sm:flex-none`}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => mutate("/api/v1/admin/overrides", "DELETE", { overrideId: o.id })}
                    className={`${btn.danger} ${btn.small} flex-1 sm:flex-none`}
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection title={`Elevated role assignments (${elevatedRoles.length})`}>
        {elevatedRoles.length === 0 ? (
          <EmptyState title="No elevated roles to review" />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {elevatedRoles.map((r) => (
              <li
                key={`${r.userId}-${r.roleId}`}
                className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.userName ?? "User"}</p>
                  <Badge tone="amber">{r.roleName}</Badge>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => keep("role", r.roleId, r.userName ?? "", `role ${r.roleName}`)}
                    className={`${btn.success} ${btn.small} flex-1 sm:flex-none`}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      mutate(`/api/v1/admin/users/${r.userId}/roles`, "DELETE", {
                        roleId: r.roleId,
                      })
                    }
                    className={`${btn.danger} ${btn.small} flex-1 sm:flex-none`}
                  >
                    Remove role
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {total === 0 ? (
        <EmptyState title="Access is fully reviewed" hint="Nothing needs attention right now." />
      ) : null}
    </div>
  );
}
