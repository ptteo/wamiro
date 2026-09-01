"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, btn } from "./ui";

export interface ApprovalItem {
  id: string;
  title: string;
  href?: string;
  amountLabel?: string;
  approvePath: string;
  canApprove: boolean;
  notApproveReason?: string;
}

export function BulkApprovalList({ items }: { items: ApprovalItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: number } | null>(null);

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runApproveAll() {
    const target = items.filter((i) => i.canApprove && selected.has(i.id));
    if (target.length === 0) return;
    setBusy(true);
    let done = 0;
    let failed = 0;
    for (const it of target) {
      try {
        const res = await fetch(it.approvePath, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        });
        if (res.ok) done++;
        else failed++;
      } catch { failed++; }
      setProgress({ done, failed });
    }
    setBusy(false);
    setSelected(new Set());
    router.refresh();
  }

  if (items.length === 0) {
    return <p className="px-5 py-4 text-sm text-tertiary">Queue empty.</p>;
  }

  const allSelected = selected.size === items.length && items.length > 0;
  const eligibleSelected = items.filter((i) => i.canApprove && selected.has(i.id)).length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-subtle px-5 py-2 text-xs">
        <label className="inline-flex items-center gap-1.5 text-tertiary">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => {
              setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
            }}
            aria-label="Select all"
          />
          {selected.size} of {items.length} selected
        </label>
        <div className="flex items-center gap-2">
          {progress && <span className="text-tertiary">{progress.done} done{progress.failed > 0 ? ` · ${progress.failed} failed` : ""}</span>}
          <button
            type="button"
            onClick={runApproveAll}
            disabled={busy || eligibleSelected === 0}
            className={btn.primary}
            title={eligibleSelected === 0 ? "Select at least one approvable item" : undefined}
          >
            {busy ? "Approving…" : `Approve ${eligibleSelected || ""}`.trim()}
          </button>
        </div>
      </div>
      <ul className="divide-y divide-border-subtle">
        {items.map((i) => {
          const checked = selected.has(i.id);
          return (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(i.id)}
                  aria-label={`Select ${i.title}`}
                  disabled={!i.canApprove}
                />
                {i.href ? (
                  <Link href={i.href} className="min-w-0 truncate font-medium hover:underline">{i.title}</Link>
                ) : (
                  <span className="min-w-0 truncate font-medium">{i.title}</span>
                )}
              </label>
              <div className="flex items-center gap-2">
                {i.amountLabel ? <Badge tone="brand">{i.amountLabel}</Badge> : null}
                {i.canApprove ? (
                  <span className="text-xs text-tertiary">ready</span>
                ) : (
                  <span className="text-xs text-tertiary">{i.notApproveReason ?? "not approvable"}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
