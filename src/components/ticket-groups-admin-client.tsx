"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, CardHeader, EmptyState, btn, input } from "./ui";

interface GroupRow {
  id: string;
  name: string;
  description: string;
  memberCount: number;
}
interface RuleRow {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string;
  category: string;
  active: boolean;
}
interface UserRow {
  id: string;
  name: string;
}

const CATEGORIES = ["incident", "service_request", "access", "hardware", "software", "other", ""];

export function TicketGroupsAdminClient({
  groups,
  rules,
  users,
}: {
  groups: GroupRow[];
  rules: RuleRow[];
  users: UserRow[];
}) {
  const router = useRouter();
  const [newGroup, setNewGroup] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [ruleName, setRuleName] = useState("");
  const [ruleGroup, setRuleGroup] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroup.trim()) return;
    const res = await fetch("/api/v1/ticket-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGroup }),
    });
    if (!res.ok) {
      const d = (await res.json()) as { error?: { message?: string } };
      setError(d.error?.message ?? "Could not create group");
      return;
    }
    setNewGroup("");
    router.refresh();
  }

  async function openMembers(g: GroupRow) {
    setExpanded(expanded === g.id ? null : g.id);
    setMemberIds([]);
    setError(null);
    if (expanded === g.id) {
      // refresh group rows after a member change
      router.refresh();
    }
  }

  async function saveMembers(g: GroupRow) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/ticket-groups/${g.id}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: memberIds }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not save members");
        return;
      }
      setExpanded(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeGroup(g: GroupRow) {
    if (!confirm(`Delete group "${g.name}"?`)) return;
    await fetch(`/api/v1/ticket-groups/${g.id}`, { method: "DELETE" });
    router.refresh();
  }

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    if (!ruleName.trim()) return;
    const res = await fetch("/api/v1/assignment-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: ruleName,
        groupId: ruleGroup || null,
        category: ruleCategory || undefined,
      }),
    });
    if (!res.ok) {
      const d = (await res.json()) as { error?: { message?: string } };
      setError(d.error?.message ?? "Could not create rule");
      return;
    }
    setRuleName("");
    router.refresh();
  }

  async function toggleRule(r: RuleRow) {
    await fetch(`/api/v1/assignment-rules/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title={`Groups (${groups.length})`} />
        {error && <p role="alert" className="px-5 text-sm text-danger">{error}</p>}
        <form onSubmit={createGroup} className="flex gap-2 px-5 py-3">
          <input
            className={`${input} h-9`}
            placeholder="New group name…"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
          />
          <button type="submit" className={`${btn.secondary} ${btn.small} shrink-0`}>Create</button>
        </form>
        {groups.length === 0 ? (
          <EmptyState title="No groups" hint="Create one, then add agents." />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {groups.map((g) => (
              <li key={g.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => void openMembers(g)}
                  >
                    <p className="font-medium text-primary hover:underline">{g.name}</p>
                    <p className="text-xs text-[var(--color-muted)]">{g.memberCount} member{g.memberCount === 1 ? "" : "s"}{g.description ? ` · ${g.description}` : ""}</p>
                  </button>
                  <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => void removeGroup(g)}>
                    Delete
                  </button>
                </div>
                {expanded === g.id && (
                  <div className="mt-3 rounded-md border border-[var(--color-line)] bg-surface-subtle p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      Select members
                    </p>
                    <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto">
                      {users.map((u) => (
                        <label key={u.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={memberIds.includes(u.id)}
                            onChange={(e) =>
                              setMemberIds((prev) =>
                                e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id),
                              )
                            }
                          />
                          {u.name}
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button type="button" className={`${btn.secondary} ${btn.small}`} disabled={busy} onClick={() => void saveMembers(g)}>
                        {busy ? "Saving…" : "Save members"}
                      </button>
                      <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => setExpanded(null)}>Close</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={`Assignment rules (${rules.length})`} />
        <form onSubmit={createRule} className="space-y-2 px-5 py-3">
          <div className="flex gap-2">
            <input
              className={`${input} h-9 flex-1`}
              placeholder="Rule name, e.g. Hardware → Devices"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
            />
            <select className={`${input} h-9 w-36`} value={ruleGroup} onChange={(e) => setRuleGroup(e.target.value)}>
              <option value="">Any group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select className={`${input} h-9 w-36`} value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c === "" ? "All categories" : c}</option>)}
            </select>
          </div>
          <button type="submit" className={`${btn.secondary} ${btn.small}`}>Add rule</button>
        </form>
        {rules.length === 0 ? (
          <EmptyState title="No rules" hint="New tickets stay unassigned until a rule routes them." />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-primary">{r.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {r.groupName || "any group"} · {r.category || "all categories"}
                  </p>
                </div>
                <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => void toggleRule(r)}>
                  {r.active ? <Badge tone="green">On</Badge> : <Badge tone="amber">Off</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}