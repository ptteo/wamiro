"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AdminSection } from "./admin-ui";
import { Avatar, Badge, EmptyState, btn, input, statusTone } from "./ui";

interface UserRow {
  id: string;
  name: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
  roles: { id: string; key: string; name: string }[];
}
interface RoleRow {
  id: string;
  key: string;
  name: string;
}
interface OverrideRow {
  id: string;
  userId: string;
  userName: string;
  permission: string;
  effect: "allow" | "deny";
  scope: string;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
}

export function AdminUsersClient({
  users,
  roles,
  overrides,
  permissions,
  canManageUsers,
  canManageRoles,
}: {
  users: UserRow[];
  roles: RoleRow[];
  overrides: OverrideRow[];
  permissions: string[];
  canManageUsers: boolean;
  canManageRoles: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<{ email: string; tempPassword: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "invited">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !`${u.name} ${u.email}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (roleFilter !== "all" && !u.roles.some((r) => r.id === roleFilter)) return false;
      return true;
    });
  }, [users, search, statusFilter, roleFilter]);

  async function call(url: string, method: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: { message?: string };
        tempPassword?: string;
      };
      if (!res.ok) {
        setError(data.error?.message ?? `Request failed (${res.status})`);
        return null;
      }
      router.refresh();
      return data;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {invited ? (
        <div role="status" className="rounded-md border border-success/30 bg-success-subtle px-4 py-3 text-sm text-success">
          <p className="font-medium">{invited.email} invited.</p>
          <p className="mt-1">
            One-time password (shown only now):{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-primary">{invited.tempPassword}</code>{" "}
            — share it securely; they should change it after first sign-in.
          </p>
        </div>
      ) : null}

      {canManageUsers ? <InviteForm roles={roles} busy={busy} onInvite={(r) => setInvited(r)} call={call} /> : null}

      <AdminSection title={`Users (${filteredUsers.length}${filteredUsers.length === users.length ? "" : ` of ${users.length}`})`}>
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              aria-label="Search users"
              placeholder="Name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${input} h-9 min-w-0`}
            />
            <select
              aria-label="Status filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className={`${input} h-9 min-w-0`}
            >
              <option value="all">All statuses</option>
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="invited">invited</option>
            </select>
            <select
              aria-label="Role filter"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className={`${input} h-9 min-w-0`}
            >
              <option value="all">All roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
        </div>
        {users.length === 0 ? (
          <EmptyState title="No users yet" hint="Invite your first teammate above." />
        ) : filteredUsers.length === 0 ? (
          <p className="py-6 text-center text-sm text-tertiary">No users match your filter.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {filteredUsers.map((u) => (
              <li key={u.id} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 items-center gap-3">
                <Avatar name={u.name} />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/users/${u.id}`} className="block truncate text-sm font-medium text-primary hover:underline">
                    {u.name}
                  </Link>
                  <p className="truncate text-xs text-tertiary">
                    {u.email}
                    {u.lastLoginAt
                      ? ` · last seen ${new Date(u.lastLoginAt).toLocaleDateString()}`
                      : " · never signed in"}
                  </p>
                </div>
                <Badge tone={statusTone(u.status)}>{u.status}</Badge>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:ml-auto">
                  {u.roles.map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-1">
                      <Badge tone="brand">{r.name}</Badge>
                      {canManageRoles ? (
                        <button
                          type="button"
                          aria-label={`Remove ${r.name} from ${u.name}`}
                          disabled={busy}
                          onClick={() => call(`/api/v1/admin/users/${u.id}/roles`, "DELETE", { roleId: r.id })}
                          className="text-xs text-tertiary hover:text-danger"
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  ))}
                  {canManageRoles && roles.length > u.roles.length ? (
                    <select
                      aria-label={`Add role to ${u.name}`}
                      className={`${input} h-8 min-w-0 py-0 text-xs sm:w-36`}
                      disabled={busy}
                      defaultValue=""
                      onChange={(e) => {
                        const roleId = e.target.value;
                        if (roleId) void call(`/api/v1/admin/users/${u.id}/roles`, "POST", { roleId });
                        e.target.value = "";
                      }}
                    >
                      <option value="" disabled>
                        + add role…
                      </option>
                      {roles
                        .filter((r) => !u.roles.some((ur) => ur.id === r.id))
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {canManageRoles ? (
        <>
          <GrantOverrideForm users={users} permissions={permissions} busy={busy} call={call} />
          <AdminSection title={`Permission overrides (${overrides.length})`}>
            {overrides.length === 0 ? (
              <EmptyState
                title="No overrides"
                hint="Direct grants and denials — including time-limited ones — appear here."
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {overrides.map((o) => (
                  <li key={o.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{o.userName}</span>{" "}
                      <code className="break-all rounded bg-surface-subtle px-1 py-0.5 text-xs">{o.permission}</code>{" "}
                      <Badge tone={o.effect === "deny" ? "red" : "green"}>
                        {o.effect} · {o.scope}
                      </Badge>
                      <span className="block text-xs text-tertiary">
                        {o.reason}
                        {o.expiresAt ? ` · expires ${new Date(o.expiresAt).toLocaleDateString()}` : " · permanent"}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={`${btn.danger} ${btn.small} w-full sm:w-auto`}
                      disabled={busy}
                      onClick={() => call("/api/v1/admin/overrides", "DELETE", { overrideId: o.id })}
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
        </>
      ) : null}
    </div>
  );
}

function InviteForm({
  roles,
  busy,
  onInvite,
  call,
}: {
  roles: RoleRow[];
  busy: boolean;
  onInvite: (r: { email: string; tempPassword: string }) => void;
  call: (url: string, method: string, body: unknown) => Promise<Record<string, unknown> | null>;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className={`${btn.primary} w-full sm:w-auto`} onClick={() => setOpen(true)}>
        Invite user
      </button>
    );
  }
  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-lg border border-border-subtle bg-surface p-4 sm:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const res = await call("/api/v1/admin/users", "POST", {
          name: f.get("name"),
          email: f.get("email"),
          roleKey: f.get("roleKey"),
        });
        if (res?.ok && typeof res.tempPassword === "string") {
          onInvite({ email: String(f.get("email")), tempPassword: res.tempPassword });
          setOpen(false);
        }
      }}
    >
      <label className="text-sm font-medium">
        Name
        <input name="name" className={`${input} mt-1`} required minLength={2} />
      </label>
      <label className="text-sm font-medium">
        Email
        <input name="email" type="email" className={`${input} mt-1`} required />
      </label>
      <label className="text-sm font-medium">
        Role
        <select name="roleKey" className={`${input} mt-1`} required defaultValue="">
          <option value="" disabled>
            Choose role…
          </option>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-2 sm:col-span-3 sm:flex-row">
        <button type="submit" className={`${btn.primary} w-full sm:w-auto`} disabled={busy}>
          {busy ? "Inviting…" : "Send invite"}
        </button>
        <button type="button" className={`${btn.secondary} w-full sm:w-auto`} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function GrantOverrideForm({
  users,
  permissions,
  busy,
  call,
}: {
  users: UserRow[];
  permissions: string[];
  busy: boolean;
  call: (url: string, method: string, body: unknown) => Promise<Record<string, unknown> | null>;
}) {
  const [open, setOpen] = useState(false);
  if (!open || users.length === 0) {
    return (
      <button type="button" className={`${btn.secondary} w-full sm:w-auto`} onClick={() => setOpen(true)} disabled={users.length === 0}>
        Grant temporary access…
      </button>
    );
  }
  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-lg border border-border-subtle bg-surface p-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const ok = await call("/api/v1/admin/overrides", "POST", {
          userId: f.get("userId"),
          permission: f.get("permission"),
          effect: f.get("effect"),
          scope: f.get("scope"),
          reason: f.get("reason"),
          expiresAt: f.get("expiresAt") ? new Date(String(f.get("expiresAt"))).toISOString() : null,
        });
        if (ok?.ok) {
          setOpen(false);
          (e.target as HTMLFormElement).reset();
        }
      }}
    >
      <label className="text-sm font-medium">
        User
        <select name="userId" className={`${input} mt-1`} required defaultValue="">
          <option value="" disabled>
            Choose user…
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Permission
        <select name="permission" className={`${input} mt-1`} required defaultValue="">
          <option value="" disabled>
            Choose permission…
          </option>
          {permissions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Effect
        <select name="effect" className={`${input} mt-1`} defaultValue="allow">
          <option value="allow">Allow</option>
          <option value="deny">Deny</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Scope
        <select name="scope" className={`${input} mt-1`} defaultValue="COMPANY">
          {["SELF", "TEAM", "DEPARTMENT", "COMPANY", "GLOBAL"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Expires (optional)
        <input type="datetime-local" name="expiresAt" className={`${input} mt-1`} />
      </label>
      <label className="text-sm font-medium">
        Reason (required, audited)
        <input name="reason" className={`${input} mt-1`} required minLength={3} maxLength={300} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
        <button type="submit" className={`${btn.primary} w-full sm:w-auto`} disabled={busy}>
          {busy ? "Saving…" : "Grant access"}
        </button>
        <button type="button" className={`${btn.secondary} w-full sm:w-auto`} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
