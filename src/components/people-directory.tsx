"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Search, X } from "lucide-react";

import { InviteTeammateForm } from "./invite-teammate";
import { Avatar, EmptyState, StatusDot } from "./ui";
import { cx } from "@/lib/cx";

export interface DirectoryPerson {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  managerName: string | null;
  status: "active" | "invited" | "suspended" | string;
}

export interface DirectoryDept {
  id: string;
  name: string;
}

type StatusFilter = "all" | "active" | "invited" | "suspended";
type ViewMode = "list" | "grid";

/**
 * Directory with:
 *  - live search (debounced URL update, no submit button)
 *  - status filter chips (All / Active / Invited / Suspended) with counts
 *  - department dropdown
 *  - list + grid view toggle
 *  - group-by-department in unfiltered list view
 *  - status dot on avatar, badge on hover
 *  - empty state with reset CTA
 */
export function PeopleDirectory({
  people,
  departments,
  statusCounts,
  scope,
}: {
  people: DirectoryPerson[];
  departments: DirectoryDept[];
  statusCounts: { all: number; active: number; invited: number; suspended: number };
  scope: "SELF" | "TEAM" | "COMPANY";
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("list");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [dept, setDept] = useState<string>("");
  const [q, setQ] = useState("");

  // Debounce URL updates so live search feels smooth.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status !== "all") params.set("status", status);
      if (dept) params.set("dept", dept);
      const qs = params.toString();
      router.replace(qs ? `/people?${qs}` : "/people", { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // intentionally exclude `router` so this effect doesn't restart on
    // every parent re-render — Next.js useRouter returns a stable ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, dept]);

  const filtered = useMemo(() => {
    return people.filter((p) => {
      if (status === "active" && p.status !== "active") return false;
      if (status === "invited" && p.status !== "invited") return false;
      if (status === "suspended" && p.status !== "suspended") return false;
      if (dept && p.departmentId !== dept) return false;
      if (q) {
        const needle = q.toLowerCase();
        if (
          !p.name.toLowerCase().includes(needle) &&
          !p.email.toLowerCase().includes(needle) &&
          !(p.jobTitle ?? "").toLowerCase().includes(needle) &&
          !(p.departmentName ?? "").toLowerCase().includes(needle)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [people, q, status, dept]);

  // Group by department for the unfiltered list view; flat for filtered.
  const groups = useMemo(() => {
    const filtering = q !== "" || status !== "all" || dept !== "";
    if (filtering) return [{ key: "all", label: null, items: filtered }];
    const byDept = new Map<string | null, DirectoryPerson[]>();
    for (const p of filtered) {
      const k = p.departmentId ?? "_none";
      const arr = byDept.get(k) ?? [];
      arr.push(p);
      byDept.set(k, arr);
    }
    const labelOf = (id: string | null) => {
      if (!id) return "No department";
      return departments.find((d) => d.id === id)?.name ?? "Other";
    };
    return Array.from(byDept.entries())
      .sort(([a], [b]) => {
        if (a === "_none") return 1;
        if (b === "_none") return -1;
        return labelOf(a).localeCompare(labelOf(b));
      })
      .map(([id, items]) => ({
        key: id ?? "_none",
        label: labelOf(id),
        items,
      }));
  }, [filtered, q, status, dept, departments]);

  const isEmpty = filtered.length === 0;
  const hasFilter = q !== "" || status !== "all" || dept !== "";

  return (
    <div className="space-y-4">
      {/* Toolbar — search + status chips + dept + view toggle */}
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
            placeholder="Search name, email, title, department…"
            aria-label="Search people"
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

        <div className="inline-flex rounded-md border border-border-default bg-surface p-0.5 text-xs">
          {([
            ["all", `All${statusCounts.all ? ` · ${statusCounts.all}` : ""}`],
            ["active", `Active${statusCounts.active ? ` · ${statusCounts.active}` : ""}`],
            ["invited", `Invited${statusCounts.invited ? ` · ${statusCounts.invited}` : ""}`],
            ["suspended", `Suspended${statusCounts.suspended ? ` · ${statusCounts.suspended}` : ""}`],
          ] as Array<[StatusFilter, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              className={cx(
                "rounded px-2.5 py-1 font-medium transition",
                status === key
                  ? "bg-brand text-on-brand"
                  : "text-tertiary hover:text-primary",
              )}
              aria-pressed={status === key}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          aria-label="Department"
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="rounded-md border border-border-default bg-surface px-2.5 py-1 text-xs text-primary focus:border-brand focus:outline-none"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <div className="ml-auto inline-flex rounded-md border border-border-default bg-surface p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            aria-label="List view"
            className={cx(
              "inline-flex h-6 w-7 items-center justify-center rounded",
              view === "list" ? "bg-brand text-on-brand" : "text-tertiary hover:text-primary",
            )}
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            className={cx(
              "inline-flex h-6 w-7 items-center justify-center rounded",
              view === "grid" ? "bg-brand text-on-brand" : "text-tertiary hover:text-primary",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Meta line */}
      <p className="text-xs text-tertiary">
        {isEmpty
          ? hasFilter
            ? "No matches"
            : "No people yet"
          : `${filtered.length} ${filtered.length === 1 ? "person" : "people"}`}
        {scope === "TEAM"
          ? " · your direct reports"
          : scope === "COMPANY"
            ? " · company directory"
            : ""}
        {hasFilter ? (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => {
                setQ("");
                setStatus("all");
                setDept("");
              }}
              className="text-brand-text hover:underline"
            >
              Reset
            </button>
          </>
        ) : null}
      </p>

      {/* Results */}
      {isEmpty ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title={hasFilter ? "No matches" : "No people yet"}
          hint={
            hasFilter
              ? "Try a different search, status, or department."
              : scope === "TEAM"
                ? "No one reports to you yet."
                : "When teammates join they'll appear here."
          }
          action={
            hasFilter ? (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setStatus("all");
                  setDept("");
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary hover:text-primary"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : view === "list" ? (
        <ListView groups={groups} />
      ) : (
        <GridView people={filtered} />
      )}
    </div>
  );
}

function ListView({ groups }: { groups: { key: string; label: string | null; items: DirectoryPerson[] }[] }) {
  return (
    <ul className="space-y-6">
      {groups.map((g) => (
        <li key={g.key}>
          {g.label ? (
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              {g.label} <span className="text-disabled">· {g.items.length}</span>
            </p>
          ) : null}
          <ul className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
            {g.items.map((p, i) => (
              <li
                key={p.userId}
                className={cx("group", i > 0 && "border-t border-border-subtle")}
              >
                <Link
                  href={`/people/${p.userId}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-hover"
                >
                  <span className="relative shrink-0">
                    <Avatar
                      name={p.name}
                      src={p.avatarUrl ?? undefined}
                      className="!h-9 !w-9 text-sm"
                    />
                    <StatusDot status={p.status} className="absolute -bottom-0.5 -right-0.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-primary">{p.name}</p>
                    <p className="truncate text-xs text-tertiary">
                      {p.jobTitle ?? "—"}
                      {p.departmentName ? ` · ${p.departmentName}` : ""}
                    </p>
                  </div>
                  <p className="hidden truncate text-xs text-tertiary sm:block sm:max-w-[180px]">
                    {p.email}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function GridView({ people }: { people: DirectoryPerson[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {people.map((p) => (
        <li key={p.userId}>
          <Link
            href={`/people/${p.userId}`}
            className="group flex h-full flex-col gap-2 rounded-lg border border-border-subtle bg-surface p-4 transition hover:border-border-default hover:shadow-[0_1px_3px_rgba(16,24,40,0.06)]"
          >
            <div className="flex items-center gap-3">
              <span className="relative shrink-0">
                <Avatar
                  name={p.name}
                  src={p.avatarUrl ?? undefined}
                  className="!h-12 !w-12 text-base"
                />
                <StatusDot status={p.status} className="absolute -bottom-0.5 -right-0.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-primary">{p.name}</p>
                <p className="truncate text-xs text-tertiary">
                  {p.jobTitle ?? p.departmentName ?? "—"}
                </p>
              </div>
            </div>
            <p className="truncate text-xs text-tertiary">{p.email}</p>
            {p.managerName ? (
              <p className="truncate text-[11px] text-tertiary">
                Reports to {p.managerName}
              </p>
            ) : null}
            {p.status !== "active" ? (
              <span
                className={cx(
                  "mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  p.status === "invited" && "bg-warning-subtle text-warning",
                  p.status === "suspended" && "bg-danger-subtle text-danger",
                )}
              >
                {p.status}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PeopleDirectoryHeaderAction({
  canInvite,
  teamOnly = false,
}: {
  canInvite: boolean;
  teamOnly?: boolean;
}) {
  if (!canInvite) return null;
  return <InviteTeammateForm teamOnly={teamOnly} />;
}
