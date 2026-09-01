"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  ChevronRight,
  Columns,
  Eye,
  Mail,
  Search,
  Users,
  X,
} from "lucide-react";

import { Avatar, StatusDot } from "./ui";
import { cx } from "@/lib/cx";

// ── Types (mirror service/orgchart.ts) ────────────────────────────
interface OrgNode {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  title: string | null;
  departmentId: string | null;
  departmentName: string | null;
  managerUserId: string | null;
  children: OrgNode[];
}
interface OrgDepartment {
  id: string;
  name: string;
  count: number;
}
interface OrgData {
  tree: OrgNode[];
  byId: Map<string, OrgNode>;
  departments: OrgDepartment[];
  totalPeople: number;
  totalRoots: number;
  maxDepth: number;
}

// ── Department color palette (8 stable hues from brand tokens) ──
const DEPT_HUES = [
  { stripe: "border-l-brand", bg: "bg-brand-subtle/40", text: "text-brand-text", solid: "bg-brand", label: "brand" },
  { stripe: "border-l-warning", bg: "bg-warning-subtle/40", text: "text-warning", solid: "bg-warning", label: "warning" },
  { stripe: "border-l-success", bg: "bg-success-subtle/40", text: "text-success", solid: "bg-success", label: "success" },
  { stripe: "border-l-info", bg: "bg-info-subtle/40", text: "text-info", solid: "bg-info", label: "info" },
  { stripe: "border-l-brand/50", bg: "bg-brand-subtle/30", text: "text-brand-text/80", solid: "bg-brand/60", label: "brand-light" },
  { stripe: "border-l-warning/50", bg: "bg-warning-subtle/30", text: "text-warning/80", solid: "bg-warning/60", label: "warning-light" },
  { stripe: "border-l-success/50", bg: "bg-success-subtle/30", text: "text-success/80", solid: "bg-success/60", label: "success-light" },
  { stripe: "border-l-info/50", bg: "bg-info-subtle/30", text: "text-info/80", solid: "bg-info/60", label: "info-light" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function hueFor(name: string | null | undefined): typeof DEPT_HUES[number] {
  if (!name) return DEPT_HUES[0]!;
  return DEPT_HUES[hashString(name) % DEPT_HUES.length]!;
}

// ── Helpers ───────────────────────────────────────────────────────
function nodeMatches(node: OrgNode, needle: string): boolean {
  return (
    node.name.toLowerCase().includes(needle) ||
    (node.email ?? "").toLowerCase().includes(needle) ||
    (node.title ?? "").toLowerCase().includes(needle) ||
    (node.departmentName ?? "").toLowerCase().includes(needle)
  );
}
function pathToMatchIds(
  node: OrgNode,
  needle: string,
  acc: Set<string>,
): boolean {
  let found = nodeMatches(node, needle);
  for (const c of node.children) {
    found = pathToMatchIds(c, needle, acc) || found;
  }
  if (found) acc.add(node.userId);
  return found;
}
function getAncestorChain(byId: Map<string, OrgNode>, userId: string): string[] {
  const chain: string[] = [];
  let cur = byId.get(userId);
  while (cur?.managerUserId) {
    chain.push(cur.managerUserId);
    cur = byId.get(cur.managerUserId);
  }
  return chain;
}

// ── Component ───────────────────────────────────────────────────
type View = "departments" | "focus";

type ViewDef = [View, string, React.ComponentType<{ className?: string }>];
const VIEW_DEFS: ViewDef[] = [
  ["departments", "Teams", Columns],
  ["focus", "Focus", Eye],
];

export function OrgChartClient({
  data,
  canEdit,
  initialFocus,
  initialView,
}: {
  data: OrgData;
  canEdit: boolean;
  initialFocus: string | null;
  initialView: View;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<string | null>(initialFocus);

  // Push URL state when view or focus changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "departments") params.set("view", view);
    if (focus) params.set("focus", focus);
    const qs = params.toString();
    router.replace(qs ? `/org-chart?${qs}` : "/org-chart", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, focus]);

  const needle = q.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!needle) return null;
    const acc = new Set<string>();
    for (const r of data.tree) pathToMatchIds(r, needle, acc);
    return acc;
  }, [needle, data.tree]);

  const focused = focus ? data.byId.get(focus) ?? null : null;

  return (
    <div className="space-y-5">
      {/* Toolbar: view tabs + search + stats */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border-default bg-surface p-0.5 text-xs">
          {VIEW_DEFS.map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setView(v);
                if (v === "focus" && !focus) {
                  // auto-focus the first root so the focus view isn't empty
                  const first = data.tree[0];
                  if (first) setFocus(first.userId);
                }
              }}
              aria-pressed={view === v}
              className={cx(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition",
                view === v
                  ? "bg-brand text-on-brand"
                  : "text-tertiary hover:text-primary",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="relative min-w-0 grow sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, title, email, or department…"
            aria-label="Search org chart"
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

        <p className="text-xs text-tertiary">
          {data.totalPeople} {data.totalPeople === 1 ? "person" : "people"} · {data.totalRoots}{" "}
          root{data.totalRoots === 1 ? "" : "s"} · depth {data.maxDepth}
        </p>
      </div>

      {/* Match summary */}
      {needle && matchIds ? (
        <p className="rounded-md border border-warning/30 bg-warning-subtle/40 px-3 py-2 text-sm text-primary">
          {matchIds.size === 0 ? (
            <span>
              No matches for <span className="font-medium">&ldquo;{q}&rdquo;</span>
            </span>
          ) : (
            <span>
              {matchIds.size} {matchIds.size === 1 ? "match" : "matches"} for{" "}
              <span className="font-medium">&ldquo;{q}&rdquo;</span>{" "}
              {"· highlighted below"}
            </span>
          )}
        </p>
      ) : null}

      {/* Body — view-dependent */}
      {data.totalPeople === 0 ? (
        <EmptyState canEdit={canEdit} />
      ) : view === "departments" ? (
        <DepartmentsView
          data={data}
          matchIds={matchIds}
          needle={needle}
          onPick={(id) => {
            setFocus(id);
            setView("focus");
          }}
        />
      ) : (
        <FocusView
          data={data}
          focus={focused}
          matchIds={matchIds}
          onChangeFocus={setFocus}
        />
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────
function EmptyState({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-border-default bg-surface px-6 py-12 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle text-tertiary">
        <Users className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-primary">No active people</p>
      <p className="mt-1 text-xs text-tertiary">
        Invite your first teammate from{" "}
        <Link href="/admin/users" className="text-brand-text hover:underline">
          Users
        </Link>{" "}
        and the chart will fill in automatically.
      </p>
    </div>
  );
}

// ── Tree view removed (departments + focus views only) ──────────

// ── Departments view (columns by color) ──────────────────────
function DepartmentsView({
  data,
  matchIds,
  needle,
  onPick,
}: {
  data: OrgData;
  matchIds: Set<string> | null;
  needle: string;
  onPick: (id: string) => void;
}) {
  // Bucket people by department id. People without a department go
  // into an "Unassigned" bucket at the end.
  const byDept = new Map<string | null, OrgNode[]>();
  for (const r of data.tree) {
    collectIntoBucket(byDept, r);
  }
  // Re-order: departments with most people first; "Unassigned" last.
  const ordered: Array<{ key: string | null; label: string; count: number; people: OrgNode[]; hue: typeof DEPT_HUES[number] }> = [];
  for (const d of data.departments) {
    const people = (byDept.get(d.id) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    ordered.push({
      key: d.id,
      label: d.name,
      count: d.count,
      people,
      hue: hueFor(d.name),
    });
    byDept.delete(d.id);
  }
  const unassigned = byDept.get(null) ?? [];
  if (unassigned.length > 0) {
    ordered.push({
      key: null,
      label: "Unassigned",
      count: unassigned.length,
      people: unassigned.sort((a, b) => a.name.localeCompare(b.name)),
      hue: DEPT_HUES[0]!,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {ordered.map((d) => (
        <section
          key={d.key ?? "unassigned"}
          aria-label={`${d.label} team`}
          className="overflow-hidden rounded-lg border border-border-subtle bg-surface"
        >
          <header
            className={cx("flex items-center justify-between border-b border-border-subtle px-3 py-2", d.hue.bg)}
          >
            <div className="flex items-center gap-2">
              <span className={cx("inline-block h-2 w-2 rounded-full", d.hue.solid)} aria-hidden />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary">
                {d.label}
              </h3>
            </div>
            <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-tertiary">
              {d.count}
            </span>
          </header>
          <ul className="divide-y divide-border-subtle">
            {d.people.map((p) => {
              const isMatch = matchIds?.has(p.userId) ?? false;
              return (
                <li key={p.userId}>
                  <button
                    type="button"
                    onClick={() => onPick(p.userId)}
                    className={cx(
                      "flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-surface-hover",
                      isMatch && "bg-warning-subtle/30",
                    )}
                  >
                    <Avatar
                      name={p.name}
                      src={p.avatarUrl ?? undefined}
                      className="!h-7 !w-7 text-[10px] ring-1 ring-border-subtle"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-primary">{p.name}</p>
                      <p className="truncate text-[10px] text-tertiary">{p.title ?? "—"}</p>
                    </div>
                    {p.managerUserId ? (
                      <span
                        title={`Reports to ${data.byId.get(p.managerUserId)?.name ?? ""}`}
                        className="text-tertiary"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function collectIntoBucket(bucket: Map<string | null, OrgNode[]>, node: OrgNode): void {
  const key = node.departmentId ?? null;
  const arr = bucket.get(key) ?? [];
  arr.push(node);
  bucket.set(key, arr);
  for (const c of node.children) collectIntoBucket(bucket, c);
}

// ── Focus view (two-pane) ─────────────────────────────────────
function FocusView({
  data,
  focus,
  matchIds,
  onChangeFocus,
}: {
  data: OrgData;
  focus: OrgNode | null;
  matchIds: Set<string> | null;
  onChangeFocus: (id: string | null) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const activeId = focus?.userId ?? picked;
  const active = activeId ? data.byId.get(activeId) ?? null : null;

  if (!active) {
    return (
      <div className="rounded-lg border border-dashed border-border-default bg-surface p-8 text-center">
        <Eye className="mx-auto h-8 w-8 text-tertiary" />
        <p className="mt-2 text-sm font-medium text-primary">Pick someone to focus on</p>
        <p className="mt-1 text-xs text-tertiary">
          Click any name in the tree or department view, or use search.
        </p>
      </div>
    );
  }

  const ancestors = getAncestorChain(data.byId, active.userId);
  const directReports = active.children.slice().sort((a, b) => a.name.localeCompare(b.name));
  const hue = hueFor(active.departmentName);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Left — a mini tree scoped to the focused person's ancestors + reports */}
      <div className="rounded-lg border border-border-subtle bg-surface p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
          Reporting context
        </p>
        <ol className="space-y-1.5" role="tree">
          {ancestors.length === 0 ? (
            <li className="rounded-md bg-surface-subtle px-3 py-2 text-xs text-tertiary">
              No manager (top of org)
            </li>
          ) : (
            ancestors
              .slice()
              .reverse()
              .map((aid) => {
                const a = data.byId.get(aid);
                if (!a) return null;
                return (
                  <li key={aid} className="flex items-center gap-2 text-sm">
                    <ChevronRight className="h-3 w-3 text-tertiary" />
                    <button
                      type="button"
                      onClick={() => onChangeFocus(aid)}
                      className="text-primary hover:underline"
                    >
                      {a.name}
                    </button>
                    <span className="text-[10px] text-tertiary">· {a.title ?? "—"}</span>
                  </li>
                );
              })
          )}
          <li className="rounded-md border border-brand/40 bg-brand-subtle px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <Avatar
                name={active.name}
                src={active.avatarUrl ?? undefined}
                className="!h-7 !w-7 text-[10px] ring-1 ring-border-subtle"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-primary">{active.name}</p>
                <p className="truncate text-[10px] text-tertiary">
                  {active.title ?? "—"}
                  {active.departmentName ? ` · ${active.departmentName}` : ""}
                </p>
              </div>
            </div>
          </li>
          {directReports.length > 0 ? (
            <li>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                Direct reports ({directReports.length})
              </p>
              <ol className="mt-1 space-y-1">
                {directReports.map((r) => {
                  const isMatch = matchIds?.has(r.userId) ?? false;
                  return (
                    <li
                      key={r.userId}
                      className={cx(
                        "flex items-center gap-2 rounded-md px-2 py-1.5",
                        isMatch && "bg-warning-subtle/40",
                      )}
                    >
                      <ChevronRight className="h-3 w-3 text-tertiary" />
                      <button
                        type="button"
                        onClick={() => onChangeFocus(r.userId)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded text-left text-sm hover:bg-surface-hover"
                      >
                        <Avatar
                          name={r.name}
                          src={r.avatarUrl ?? undefined}
                          className="!h-6 !w-6 text-[9px] ring-1 ring-border-subtle"
                        />
                        <span className="truncate text-primary">{r.name}</span>
                        <span className="truncate text-[10px] text-tertiary">· {r.title ?? "—"}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </li>
          ) : (
            <li className="rounded-md bg-surface-subtle px-3 py-2 text-xs text-tertiary">
              No direct reports
            </li>
          )}
        </ol>
        {directReports.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              Sub-tree
            </p>
            <SubTree node={active} matchIds={matchIds} onPick={onChangeFocus} depth={1} />
          </div>
        ) : null}
      </div>

      {/* Right — detail card */}
      <aside className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
          <div className={cx("h-2", hue.solid)} aria-hidden />
          <div className="p-5">
            <div className="flex items-start gap-3">
              <Avatar
                name={active.name}
                src={active.avatarUrl ?? undefined}
                className="!h-14 !w-14 text-base ring-1 ring-border-subtle"
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-primary">{active.name}</h2>
                <p className="text-sm text-secondary">
                  {active.title ?? "Team member"}
                  {active.departmentName ? ` · ${active.departmentName}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <StatusDot status="active" />
                  <span className="text-[10px] uppercase tracking-wide text-tertiary">active</span>
                </div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="Email">
                <a href={`mailto:${active.email}`} className="truncate text-primary hover:underline">
                  {active.email}
                </a>
              </DetailRow>
              <DetailRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Title">
                {active.title ?? "—"}
              </DetailRow>
              <DetailRow icon={<Building2 className="h-3.5 w-3.5" />} label="Department">
                {active.departmentName ?? "—"}
              </DetailRow>
              <DetailRow icon={<Users className="h-3.5 w-3.5" />} label="Direct reports">
                {directReports.length}
              </DetailRow>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/people/${active.userId}`}
                className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-on-brand hover:bg-brand-hover"
              >
                Open profile
              </Link>
              {active.managerUserId ? (
                <Link
                  href={`/org-chart?view=focus&focus=${active.managerUserId}`}
                  className="rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-secondary hover:text-primary"
                >
                  View manager
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {/* Breadcrumb */}
        {ancestors.length > 0 ? (
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              Reports up to
            </p>
            <ol className="mt-1.5 space-y-0.5 text-sm">
              {ancestors.slice().reverse().map((aid) => {
                const a = data.byId.get(aid);
                if (!a) return null;
                return (
                  <li key={aid} className="flex items-center gap-1 text-secondary">
                    <ChevronRight className="h-3 w-3 text-tertiary" />
                    <button
                      type="button"
                      onClick={() => onChangeFocus(aid)}
                      className="hover:text-primary hover:underline"
                    >
                      {a.name}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function SubTree({
  node,
  matchIds,
  onPick,
  depth,
}: {
  node: OrgNode;
  matchIds: Set<string> | null;
  onPick: (id: string) => void;
  depth: number;
}) {
  if (depth > 4) return null; // bound the recursion in the focus view
  return (
    <ul className="space-y-1">
      {node.children.map((c) => {
        const isMatch = matchIds?.has(c.userId) ?? false;
        return (
          <li
            key={c.userId}
            style={{ marginLeft: `${Math.min(depth - 1, 3) * 14}px` }}
          >
            <button
              type="button"
              onClick={() => onPick(c.userId)}
              className={cx(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-hover",
                isMatch && "bg-warning-subtle/30",
              )}
            >
              <Avatar
                name={c.name}
                src={c.avatarUrl ?? undefined}
                className="!h-5 !w-5 text-[8px] ring-1 ring-border-subtle"
              />
              <span className="truncate text-primary">{c.name}</span>
              <span className="truncate text-[10px] text-tertiary">· {c.title ?? "—"}</span>
            </button>
            {c.children.length > 0 ? (
              <SubTree node={c} matchIds={matchIds} onPick={onPick} depth={depth + 1} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-surface-subtle px-3 py-2">
      <span className="mt-0.5 text-tertiary" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
          {label}
        </p>
        <p className="truncate">{children}</p>
      </div>
    </div>
  );
}