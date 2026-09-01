"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { Avatar, EmptyState } from "./ui";
import { cx } from "@/lib/cx";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  jobTitle: string | null;
}

export interface Team {
  id: string;
  name: string;
  memberCount: number;
  lead: TeamMember | null;
  previewMembers: TeamMember[];
  members: TeamMember[];
}

/**
 * Teams directory — grid of cards + live search + inline member add /
 * delete. The "create team" affordance is a tile at the start of the
 * grid (when the user has teams.manage), so the page stays
 * symmetrical — every row is a team, including the "make a new one"
 * affordance.
 */
export function TeamsClient({ teams, canManage }: { teams: Team[]; canManage: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Debounce search into the URL so the page is shareable + back-button
  // friendly. Same pattern as the directory.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const qs = params.toString();
      router.replace(qs ? `/teams?${qs}` : "/teams", { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filtered = useMemo(() => {
    if (!q) return teams;
    const needle = q.toLowerCase();
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        t.members.some((m) => m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle)),
    );
  }, [teams, q]);

  async function createTeam(name: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/v1/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not create team");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function deleteTeam(id: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/v1/teams/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not delete team");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addMember(teamId: string, email: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/v1/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not add member");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(teamId: string, email: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/v1/teams/${teamId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setError("Could not remove member");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const isEmpty = teams.length === 0;
  const noMatches = !isEmpty && filtered.length === 0;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 grow sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search team or member name…"
            aria-label="Search teams"
            className="w-full rounded-md border border-border-default bg-surface py-1.5 pl-8 pr-8 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          {q ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-tertiary hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {canManage && !isEmpty ? (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition hover:bg-brand-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            New team
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {creating && canManage ? (
        <NewTeamForm
          busy={busy}
          onCancel={() => setCreating(false)}
          onSubmit={async (name) => {
            if (await createTeam(name)) setCreating(false);
          }}
        />
      ) : null}

      {/* Meta line */}
      <p className="text-xs text-tertiary">
        {isEmpty
          ? "No teams yet"
          : noMatches
            ? "No matches"
            : `${filtered.length} ${filtered.length === 1 ? "team" : "teams"}`}
        {q && !noMatches && !isEmpty ? (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => setQ("")}
              className="text-brand-text hover:underline"
            >
              Reset
            </button>
          </>
        ) : null}
      </p>

      {/* Grid */}
      {isEmpty ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No teams yet"
          hint="Group people across departments — Customer Success, Hiring Committee, Onboarding Buddies, etc."
          action={
            canManage ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand hover:bg-brand-hover"
              >
                <Plus className="h-3.5 w-3.5" />
                Create your first team
              </button>
            ) : undefined
          }
        />
      ) : noMatches ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="No teams match your search"
          hint="Try a different team name or member name."
          action={
            <button
              type="button"
              onClick={() => setQ("")}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary hover:text-primary"
            >
              Clear search
            </button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <li key={t.id}>
              <TeamCard
                team={t}
                canManage={canManage}
                isOpen={openTeamId === t.id}
                isMenuOpen={menuOpenId === t.id}
                onToggle={() => setOpenTeamId(openTeamId === t.id ? null : t.id)}
                onToggleMenu={() => setMenuOpenId(menuOpenId === t.id ? null : t.id)}
                onDelete={() => deleteTeam(t.id)}
                onAdd={(email) => addMember(t.id, email)}
                onRemove={(email) => removeMember(t.id, email)}
                busy={busy}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewTeamForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (name: string) => void | Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await onSubmit(name.trim());
        setName("");
      }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Team name (e.g. Customer Success)"
        required
        minLength={2}
        maxLength={80}
        className="grow rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand hover:bg-brand-hover disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-tertiary hover:text-primary"
      >
        Cancel
      </button>
    </form>
  );
}

function TeamCard({
  team,
  canManage,
  isOpen,
  isMenuOpen,
  onToggle,
  onToggleMenu,
  onDelete,
  onAdd,
  onRemove,
  busy,
}: {
  team: Team;
  canManage: boolean;
  isOpen: boolean;
  isMenuOpen: boolean;
  onToggle: () => void;
  onToggleMenu: () => void;
  onDelete: () => void;
  onAdd: (email: string) => Promise<boolean>;
  onRemove: (email: string) => void | Promise<void>;
  busy: boolean;
}) {
  return (
    <article
      className={cx(
        "group flex h-full flex-col overflow-hidden rounded-lg border bg-surface transition",
        isOpen ? "border-brand/40 ring-1 ring-brand/20" : "border-border-subtle hover:border-border-default",
      )}
    >
      {/* Header band */}
      <div className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-primary">{team.name}</h3>
          <p className="mt-0.5 text-xs text-tertiary">
            {team.memberCount === 0
              ? "No members yet"
              : `${team.memberCount} ${team.memberCount === 1 ? "member" : "members"}`}
            {team.lead && team.memberCount > 0 ? (
              <>
                {" · led by "}
                <Link href={`/people/${team.lead.userId}`} className="text-secondary hover:text-primary hover:underline">
                  {team.lead.name}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {canManage ? (
          <div className="relative">
            <button
              type="button"
              onClick={onToggleMenu}
              aria-label="Team actions"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-tertiary opacity-0 transition group-hover:opacity-100 hover:bg-surface-hover hover:text-primary data-[open=true]:opacity-100"
              data-open={isMenuOpen}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {isMenuOpen ? (
              <div className="absolute right-0 top-8 z-10 w-44 overflow-hidden rounded-md border border-border-default bg-surface shadow-[0_4px_12px_rgba(16,24,40,0.08)]">
                <button
                  type="button"
                  onClick={() => {
                    onToggleMenu();
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-subtle"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete team
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Member preview — stacked avatars */}
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
        <div className="flex items-center">
          {team.previewMembers.length === 0 ? (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-subtle text-tertiary">
              <Users className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ul className="flex -space-x-1.5">
              {team.previewMembers.map((m) => (
                <li key={m.userId} title={`${m.name} · ${m.email}`}>
                  <Link
                    href={`/people/${m.userId}`}
                    className="inline-block"
                  >
                    <Avatar
                      name={m.name}
                      src={m.avatarUrl ?? undefined}
                      className="!h-7 !w-7 text-[10px] ring-2 ring-surface"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {team.memberCount > team.previewMembers.length ? (
            <span className="ml-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-surface-subtle px-1 text-[10px] font-semibold text-tertiary ring-2 ring-surface">
              +{team.memberCount - team.previewMembers.length}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className={cx(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition",
            isOpen
              ? "bg-brand-subtle text-brand-text"
              : "text-secondary hover:bg-surface-hover hover:text-primary",
          )}
        >
          {isOpen ? "Hide" : "View"}
          <ChevronDown
            className={cx("h-3 w-3 transition", isOpen && "rotate-180")}
            aria-hidden
          />
        </button>
      </div>

      {/* Expanded member list */}
      {isOpen ? (
        <div className="border-t border-border-subtle bg-surface-subtle/40">
          {team.members.length === 0 ? (
            <p className="px-4 py-3 text-xs text-tertiary">No members yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {team.members.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center gap-3 px-4 py-2 text-sm"
                >
                  <Avatar name={m.name} src={m.avatarUrl ?? undefined} className="!h-7 !w-7 text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/people/${m.userId}`}
                      className="truncate font-medium text-primary hover:underline"
                    >
                      {m.name}
                    </Link>
                    <p className="truncate text-xs text-tertiary">
                      {m.jobTitle ?? "—"}
                    </p>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => onRemove(m.email)}
                      disabled={busy}
                      aria-label={`Remove ${m.name}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-tertiary hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canManage ? <AddMemberForm busy={busy} onAdd={onAdd} /> : null}
        </div>
      ) : null}
    </article>
  );
}

function AddMemberForm({
  onAdd,
  busy,
}: {
  onAdd: (email: string) => Promise<boolean>;
  busy: boolean;
}) {
  const [email, setEmail] = useState("");
  return (
    <form
      className="flex items-center gap-2 border-t border-border-subtle bg-surface px-4 py-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!email.trim()) return;
        const ok = await onAdd(email.trim());
        if (ok) setEmail("");
      }}
    >
      <UserPlus className="h-3.5 w-3.5 text-tertiary" aria-hidden />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Add by email…"
        className="grow rounded-md border border-border-default bg-surface px-2.5 py-1 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        required
      />
      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-on-brand hover:bg-brand-hover disabled:opacity-50"
      >
        <Check className="h-3 w-3" />
        Add
      </button>
    </form>
  );
}
