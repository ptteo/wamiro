"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Calculator,
  ChevronDown,
  ChevronRight,
  Download,
  Layers,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react";

import { Button } from "./ui";
import { cx } from "@/lib/cx";

export interface PayslipDto {
  id: string;
  runId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  runStatus: string;
  /** present on run-detail payloads (manage view); not on the employee's own list */
  employeeUserId?: string;
  employeeName?: string;
  employeeCode?: string | null;
  earnings: { component: string; amount: number }[];
  deductions: { component: string; amount: number }[];
  gross: number;
  totalDeductions: number;
  net: number;
  currency: string;
  locked: boolean;
}

export interface PayrollData {
  canManage: boolean;
  mine: PayslipDto[];
  components: {
    id: string;
    name: string;
    type: string;
    amountType: string;
    defaultAmount: number;
    isTaxable: boolean;
    active: boolean;
  }[];
  structures: {
    id: string;
    employeeUserId: string;
    employeeName: string;
    name: string;
    base: number;
    currency: string;
    effectiveFrom: string;
    status: string;
    lineCount: number;
  }[];
  runs: {
    id: string;
    periodLabel: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    currency: string;
    createdAt: string;
    payslipCount: number;
    gross: number;
    totalDeductions: number;
    net: number;
  }[];
  members: { id: string; name: string; employeeCode: string | null }[];
}

export interface RunDetailDto {
  run: PayrollData["runs"][number];
  payslips: PayslipDto[];
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-surface-subtle text-tertiary",
  submitted: "bg-warning-subtle text-warning",
  approved: "bg-brand-subtle text-brand",
  paid: "bg-success-subtle text-success",
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-secondary">{label}</dt>
      <dd className={cx("tabular-nums", strong ? "font-semibold text-primary" : "text-primary")}>{value}</dd>
    </div>
  );
}

function PayslipView({ p, compact }: { p: PayslipDto; compact?: boolean }) {
  return (
    <div className={cx("rounded-lg border border-border-subtle bg-surface", !compact && "p-4")}>
      {!compact && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-primary">{p.periodLabel} — payslip</p>
            {p.employeeName ? <p className="text-xs text-tertiary">{p.employeeName}</p> : null}
          </div>
          <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_TONE[p.runStatus])}>
            {p.runStatus}
          </span>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">Earnings</p>
          <dl className="space-y-1">
            {p.earnings.map((e) => (
              <Row key={e.component} label={e.component} value={fmtMoney(e.amount)} />
            ))}
          </dl>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">Deductions</p>
          {p.deductions.length === 0 ? (
            <p className="text-sm text-tertiary">None</p>
          ) : (
            <dl className="space-y-1">
              {p.deductions.map((d) => (
                <Row key={d.component} label={d.component} value={fmtMoney(d.amount)} />
              ))}
            </dl>
          )}
        </div>
      </div>
      <div className="mt-3 border-t border-border-subtle pt-2">
        <dl className="space-y-1">
          <Row label="Gross pay" value={fmtMoney(p.gross)} />
          <Row label="Total deductions" value={`−${fmtMoney(p.totalDeductions)}`} />
          <Row label="Net pay" value={fmtMoney(p.net)} strong />
        </dl>
      </div>
    </div>
  );
}

function RunDetailPane({ detail }: { detail: RunDetailDto | undefined }) {
  return (
    <div className="mt-3 space-y-2 border-l-2 border-border-subtle pl-4">
      {!detail ? (
        <p className="text-xs text-tertiary">Loading…</p>
      ) : detail.payslips.length === 0 ? (
        <p className="text-xs text-tertiary">
          No payslips yet — compute this run to generate them from active salary structures.
        </p>
      ) : (
        detail.payslips.map((p) => (
          <div key={p.id} className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-primary">{p.employeeName}</span>
              <span className="text-sm font-semibold tabular-nums text-primary">{fmtMoney(p.net)}</span>
            </div>
            <PayslipView p={p} compact />
          </div>
        ))
      )}
    </div>
  );
}

export function PayrollClient({ data }: { data: PayrollData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runDetails, setRunDetails] = useState<Record<string, RunDetailDto>>({});

  // ── new run form ──
  const todayIso = new Date().toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(todayIso);
  const [periodEnd, setPeriodEnd] = useState(todayIso);

  // ── new component form ──
  const [compName, setCompName] = useState("");
  const [compType, setCompType] = useState<"earning" | "deduction">("earning");
  const [compAmountType, setCompAmountType] = useState<"fixed" | "percent_of_basic">("fixed");
  const [compAmount, setCompAmount] = useState("100");

  // ── structure form ──
  const [structEmployee, setStructEmployee] = useState("");
  const [structName, setStructName] = useState("");
  const [base, setBase] = useState("1000");
  const [currency, setCurrency] = useState("USD");
  const [effective, setEffective] = useState(todayIso);
  const [lines, setLines] = useState<{ componentId: string; value: string }[]>([]);

  // ── bank form ──
  const [bankEmployee, setBankEmployee] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [ifsc, setIfsc] = useState("");

  // YTD (manage only)
  const [ytd, setYtd] = useState<{ employeeName: string; periods: number; gross: number; net: number }[]>([]);
  useEffect(() => {
    if (!data.canManage) return;
    fetch("/api/v1/payroll/ytd")
      .then((r) => r.json())
      .then((d: { rows?: { employeeName: string; periods: number; gross: number; net: number }[] }) =>
        setYtd(d.rows ?? []),
      )
      .catch(() => {});
  }, [data.canManage, expandedRun]);

  const compById = useMemo(() => new Map(data.components.map((c) => [c.id, c])), [data.components]);
  const activeComps = data.components.filter((c) => c.active);

  async function call(url: string, method: string, body: unknown, successMsg: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok) {
        setError(d.error?.message ?? `Request failed (${res.status})`);
        return false;
      }
      setInfo(successMsg);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function runAction(path: string, successMsg: string) {
    const ok = await call(path, "POST", {}, successMsg);
    return ok;
  }

  async function toggleRun(id: string) {
    if (expandedRun === id) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(id);
    if (!runDetails[id]) {
      try {
        const res = await fetch(`/api/v1/payroll/runs/${id}`);
        const d = (await res.json()) as RunDetailDto & { error?: { message?: string } };
        if (!res.ok) throw new Error(d.error?.message ?? "Failed to load run");
        setRunDetails((prev) => ({ ...prev, [id]: d }));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }

  const createComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compName.trim()) return setError("Component name is required");
    const ok = await call(
      "/api/v1/payroll/components",
      "POST",
      {
        name: compName.trim(),
        type: compType,
        amountType: compAmountType,
        defaultAmount: Number(compAmount) || 0,
      },
      "Component created",
    );
    if (ok) {
      setCompName("");
      setCompAmount("100");
    }
  };

  const deactivateComp = async (id: string) => {
    if (!confirm("Deactivate this component? It stays on existing structures.")) return;
    const ok = await call(`/api/v1/payroll/components/${id}`, "DELETE", {}, "Component deactivated");
    void ok;
  };

  const createRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (periodEnd < periodStart) return setError("Period end must be after start");
    const ok = await call(
      "/api/v1/payroll/runs",
      "POST",
      { periodStart, periodEnd, currency },
      "Payroll run created — now compute it",
    );
    if (ok) setExpandedRun(null);
  };

  const compute = async (id: string) => {
    const ok = await runAction(`/api/v1/payroll/runs/${id}/compute`, "Payslips computed from active salary structures");
    if (ok) setRunDetails({});
  };

  const createStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!structEmployee) return setError("Choose an employee");
    const baseNum = Number(base);
    if (!(baseNum > 0)) return setError("Base pay must be positive");
    if (lines.length === 0) return setError("Add at least one component line");
    const payloadLines = lines.map((l) => {
      const c = compById.get(l.componentId);
      const isPct = c?.amountType === "percent_of_basic";
      const val = Number(l.value) || 0;
      return isPct
        ? { componentId: l.componentId, percentOfBasic: val }
        : { componentId: l.componentId, amount: val };
    });
    const ok = await call(
      "/api/v1/payroll/structures",
      "POST",
      {
        employeeUserId: structEmployee,
        name: structName.trim() || undefined,
        base: baseNum,
        currency,
        effectiveFrom: effective,
        lines: payloadLines,
      },
      "Salary structure saved",
    );
    if (ok) {
      setLines([]);
      setStructName("");
    }
  };

  const setBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankEmployee) return setError("Choose an employee");
    const ok = await call(
      "/api/v1/payroll/bank",
      "POST",
      { employeeUserId: bankEmployee, bankName, bankAccountNo: accountNo, ifscCode: ifsc },
      "Bank details saved",
    );
    if (ok) {
      setBankName("");
      setAccountNo("");
      setIfsc("");
    }
  };

  const exportCsv = (runId: string) => {
    window.open(`/api/v1/payroll/export?runId=${runId}`, "_blank");
  };

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {info && (
        <p className="rounded-md border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">{info}</p>
      )}

      {/* ── Employee self-service ── */}
      <section className="rounded-lg border border-border-subtle bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
          <Receipt className="h-4 w-4 text-tertiary" /> My payslips
        </h2>
        {data.mine.length === 0 ? (
          <p className="py-6 text-center text-sm text-tertiary">
            No payslips yet — they appear here once payroll is run and approved.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.mine.map((p) => (
              <li key={p.id}>
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 rounded-md px-1 py-2 hover:bg-surface-hover">
                    <ChevronRight className="h-4 w-4 text-tertiary" />
                    <span className="text-sm font-medium text-primary">{p.periodLabel}</span>
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                        STATUS_TONE[p.runStatus],
                      )}
                    >
                      {p.runStatus}
                    </span>
                    <span className="flex-1" />
                    <span className="text-sm font-semibold tabular-nums text-primary">{fmtMoney(p.net)}</span>
                  </summary>
                  <div className="mt-2">
                    <PayslipView p={p} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.canManage && (
        <>
          {/* ── Runs ── */}
          <section className="rounded-lg border border-border-subtle bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Layers className="h-4 w-4 text-tertiary" /> Payroll runs
              </h2>
              <span className="text-xs text-tertiary">{data.runs.length} run(s)</span>
            </div>
            {data.runs.length === 0 ? (
              <p className="py-4 text-center text-sm text-tertiary">
                No runs yet — create one with the form, then compute payslips.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {data.runs.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleRun(r.id)}
                        className="flex min-w-0 items-center gap-1 text-sm font-medium text-primary hover:text-brand"
                      >
                        {expandedRun === r.id ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-tertiary" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-tertiary" />
                        )}
                        <span className="truncate">{r.periodLabel}</span>
                      </button>
                      <span
                        className={cx(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                          STATUS_TONE[r.status],
                        )}
                      >
                        {r.status}
                      </span>
                      <span className="text-xs text-tertiary">
                        {r.payslipCount} slip(s) · net {fmtMoney(r.net)}
                      </span>
                      <span className="flex-1" />
                      <div className="flex flex-wrap gap-1.5">
                        {r.status === "draft" && (
                          <>
                            <Button size="sm" loading={busy} onClick={() => compute(r.id)}>
                              <Calculator className="h-3.5 w-3.5" /> Compute
                            </Button>
                            <Button size="sm" loading={busy} onClick={() => runAction(`/api/v1/payroll/runs/${r.id}/submit`, "Run submitted")}>
                              Submit
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={async () => {
                                if (!confirm("Delete this draft run and its payslips?")) return;
                                await runAction(`/api/v1/payroll/runs/${r.id}`, "Draft run deleted");
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {r.status === "submitted" && (
                          <Button size="sm" variant="primary" loading={busy} onClick={() => runAction(`/api/v1/payroll/runs/${r.id}/approve`, "Run approved")}>
                            Approve
                          </Button>
                        )}
                        {r.status === "approved" && (
                          <>
                            <Button size="sm" variant="primary" loading={busy} onClick={() => runAction(`/api/v1/payroll/runs/${r.id}/paid`, "Run paid — payslips locked")}>
                              <Banknote className="h-3.5 w-3.5" /> Mark paid
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => exportCsv(r.id)}>
                              <Download className="h-3.5 w-3.5" /> Bank CSV
                            </Button>
                          </>
                        )}
                        {r.status === "paid" && (
                          <Button size="sm" variant="secondary" onClick={() => exportCsv(r.id)}>
                            <Download className="h-3.5 w-3.5" /> Bank CSV
                          </Button>
                        )}
                      </div>
                    </div>
                    {expandedRun === r.id && (
                      <RunDetailPane detail={runDetails[r.id]} />
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* new run */}
            <form onSubmit={createRun} className="mt-4 grid gap-3 rounded-lg border border-border-subtle bg-surface-subtle p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="flex flex-col text-[11px] font-medium text-secondary">
                Period start
                <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary" />
              </label>
              <label className="flex flex-col text-[11px] font-medium text-secondary">
                Period end
                <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary" />
              </label>
              <Button variant="primary" loading={busy}>
                <Plus className="h-4 w-4" /> New run
              </Button>
            </form>
          </section>

          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            {/* ── Structures ── */}
            <section className="min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-surface p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                <Receipt className="h-4 w-4 text-tertiary" /> Salary structures
              </h2>
              {data.structures.length > 0 && (
                <ul className="mb-4 max-h-56 space-y-1 overflow-auto rounded-md bg-surface-subtle p-2 text-sm">
                  {data.structures.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-primary">{s.employeeName}</span>
                      <span className="text-xs tabular-nums text-secondary">{fmtMoney(s.base)}</span>
                      <span
                        className={cx(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                          s.status === "active"
                            ? "bg-success-subtle text-success"
                            : s.status === "draft"
                              ? "bg-warning-subtle text-warning"
                              : "bg-surface-subtle text-tertiary",
                        )}
                      >
                        {s.status}
                      </span>
                      {s.status === "draft" && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await call(`/api/v1/payroll/structures/${s.id}/activate`, "POST", {}, "Structure activated");
                            void ok;
                          }}
                          className="text-xs font-medium text-brand hover:underline"
                        >
                          Activate
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mb-2 text-sm font-semibold text-primary">New structure</h3>
              <form onSubmit={createStructure} className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col text-[11px] font-medium text-secondary">
                    Employee
                    <select value={structEmployee} onChange={(e) => setStructEmployee(e.target.value)} className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary">
                      <option value="">Choose…</option>
                      {data.members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {m.employeeCode ? ` (${m.employeeCode})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col text-[11px] font-medium text-secondary">
                    Base pay
                    <input type="number" min={0} step={0.01} value={base} onChange={(e) => setBase(e.target.value)} className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary" />
                  </label>
                  <label className="flex flex-col text-[11px] font-medium text-secondary">
                    Effective from
                    <input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary" />
                  </label>
                  <label className="flex flex-col text-[11px] font-medium text-secondary">
                    Name (optional)
                    <input value={structName} onChange={(e) => setStructName(e.target.value)} placeholder="e.g. 2026 package" className="mt-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary placeholder:text-tertiary" />
                  </label>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[11px] font-medium text-secondary">Components</p>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => [...prev, { componentId: "", value: "" }])}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add line
                    </button>
                  </div>
                  {lines.length === 0 && <p className="text-xs text-tertiary">No lines yet — add earnings or deductions.</p>}
                  <ul className="space-y-2">
                    {lines.map((l, i) => {
                      const c = l.componentId ? compById.get(l.componentId) : undefined;
                      const isPct = c?.amountType === "percent_of_basic";
                      return (
                        <li key={i} className="flex items-center gap-2">
                          <select
                            value={l.componentId}
                            onChange={(e) => {
                              const next = [...lines];
                              next[i] = { componentId: e.target.value, value: "" };
                              setLines(next);
                            }}
                            className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary"
                          >
                            <option value="">Choose component…</option>
                            {activeComps.map((c2) => (
                              <option key={c2.id} value={c2.id}>
                                {c2.name} ({c2.type})
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={0}
                            step={isPct ? 0.5 : 0.01}
                            value={l.value}
                            placeholder={isPct ? "% of base" : "amount"}
                            onChange={(e) => {
                              const next = [...lines];
                              next[i] = { ...l, value: e.target.value };
                              setLines(next);
                            }}
                            className="w-24 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary placeholder:text-tertiary"
                          />
                          <button
                            type="button"
                            aria-label="Remove line"
                            onClick={() => setLines((prev) => prev.filter((_, x) => x !== i))}
                            className="text-tertiary hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <Button variant="primary" loading={busy} className="justify-center">
                  Save structure
                </Button>
              </form>
            </section>

            {/* ── Components + bank + YTD ── */}
            <div className="min-w-0 space-y-5">
              <section className="min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-surface p-4">
                <h2 className="mb-3 text-sm font-semibold text-primary">Component library</h2>
                <form onSubmit={createComponent} className="mb-3 grid min-w-0 grid-cols-1 gap-2 rounded-md bg-surface-subtle p-3 sm:grid-cols-2">
                  <label className="flex min-w-0 flex-col text-[11px] font-medium text-secondary sm:col-span-2">
                    Name
                    <input value={compName} onChange={(e) => setCompName(e.target.value)} placeholder="HRA / PF / Laptop allowance…" className="mt-1 min-w-0 w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary placeholder:text-tertiary" />
                  </label>
                  <label className="flex min-w-0 flex-col text-[11px] font-medium text-secondary">
                    Type
                    <select value={compType} onChange={(e) => setCompType(e.target.value as "earning" | "deduction")} className="mt-1 min-w-0 w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary">
                      <option value="earning">Earning</option>
                      <option value="deduction">Deduction</option>
                    </select>
                  </label>
                  <label className="flex min-w-0 flex-col text-[11px] font-medium text-secondary">
                    Basis
                    <select value={compAmountType} onChange={(e) => setCompAmountType(e.target.value as "fixed" | "percent_of_basic")} className="mt-1 min-w-0 w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary">
                      <option value="fixed">Fixed amount</option>
                      <option value="percent_of_basic">% of basic</option>
                    </select>
                  </label>
                  <label className="flex min-w-0 flex-col text-[11px] font-medium text-secondary">
                    Default
                    <input type="number" min={0} step={compAmountType === "percent_of_basic" ? 0.5 : 0.01} value={compAmount} onChange={(e) => setCompAmount(e.target.value)} className="mt-1 min-w-0 w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary" />
                  </label>
                  <div className="sm:col-span-2">
                    <Button size="sm" variant="primary" loading={busy} className="w-full sm:w-auto">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                </form>
                {data.components.length === 0 ? (
                  <p className="text-sm text-tertiary">No components yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.components.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 text-sm">
                        <span
                          className={cx(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                            c.type === "earning" ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger",
                          )}
                        >
                          {c.type}
                        </span>
                        <span className={cx("flex-1 truncate text-primary", !c.active && "text-tertiary line-through")}>
                          {c.name}
                        </span>
                        <span className="text-xs tabular-nums text-secondary">
                          {c.amountType === "percent_of_basic" ? `${c.defaultAmount}%` : fmtMoney(c.defaultAmount)}
                        </span>
                        {c.active && (
                          <button
                            type="button"
                            aria-label={`Deactivate ${c.name}`}
                            onClick={() => deactivateComp(c.id)}
                            className="text-tertiary hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-border-subtle bg-surface p-4">
                <h2 className="mb-3 text-sm font-semibold text-primary">Bank details (for remittance)</h2>
                <form onSubmit={setBank} className="grid gap-2">
                  <select value={bankEmployee} onChange={(e) => setBankEmployee(e.target.value)} className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary">
                    <option value="">Choose an employee…</option>
                    {data.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank name" className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary placeholder:text-tertiary" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} placeholder="Account number" className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary placeholder:text-tertiary" />
                    <input value={ifsc} onChange={(e) => setIfsc(e.target.value)} placeholder="IFSC / routing" className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-primary placeholder:text-tertiary" />
                  </div>
                  <Button size="sm" loading={busy} className="justify-center">
                    Save bank details
                  </Button>
                </form>
              </section>

              <section className="rounded-lg border border-border-subtle bg-surface p-4">
                <h2 className="mb-3 text-sm font-semibold text-primary">Year to date</h2>
                {ytd.length === 0 ? (
                  <p className="text-sm text-tertiary">Nothing paid yet this year.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {ytd.map((r) => (
                      <li key={r.employeeName} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-primary">
                          {r.employeeName}
                          <span className="ml-1 text-[10px] text-tertiary">{r.periods} period(s)</span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-primary">{fmtMoney(r.net)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
