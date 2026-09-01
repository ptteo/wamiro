"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn } from "./ui";

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
    <>
      <p className="text-sm text-[var(--color-muted)]">
        Review each grant and decide whether it should stay. “Keep” records the decision in the
        audit log; revocations take effect immediately.
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Card>
        <CardHeader title={`Permission grants (${overrides.length})`} />
        {overrides.length === 0 ? (
          <EmptyState title="No direct grants to review" />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {overrides.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {o.userName}{" "}
                    <Badge tone={o.effect === "deny" ? "red" : "brand"}>
                      {o.effect} · {o.permission}
                    </Badge>
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    scope {o.scope} · {o.reason}
                    {o.expiresAt
                      ? ` · expires ${new Date(o.expiresAt).toLocaleDateString()}`
                      : " · no expiry"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      keep("override", o.id, o.userName, `${o.effect} ${o.permission}@${o.scope}`)
                    }
                    className={`${btn.success} ${btn.small}`}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => mutate("/api/v1/admin/overrides", "DELETE", { overrideId: o.id })}
                    className={`${btn.danger} ${btn.small}`}
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={`Elevated role assignments (${elevatedRoles.length})`} />
        {elevatedRoles.length === 0 ? (
          <EmptyState title="No elevated roles to review" />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {elevatedRoles.map((r) => (
              <li
                key={`${r.userId}-${r.roleId}`}
                className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.userName ?? "User"}</p>
                  <Badge tone="amber">{r.roleName}</Badge>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => keep("role", r.roleId, r.userName ?? "", `role ${r.roleName}`)}
                    className={`${btn.success} ${btn.small}`}
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
                    className={`${btn.danger} ${btn.small}`}
                  >
                    Remove role
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {total === 0 && (
        <Card>
          <EmptyState
            title="Access is fully reviewed"
            hint="Nothing needs attention right now."
          />
        </Card>
      )}
    </>
  );
}
