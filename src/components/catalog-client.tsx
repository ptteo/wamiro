"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Card, btn, input } from "./ui";

interface ServiceItem {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  expectedDays: number | null;
  approvalRequired: boolean;
}

const CATEGORY_TONE: Record<string, "brand" | "amber" | "neutral" | "green" | "red"> = {
  access: "brand",
  hardware: "amber",
  software: "brand",
  accounts: "neutral",
  security: "red",
  facilities: "neutral",
  travel: "green",
  other: "neutral",
};

export function CatalogClient({ services }: { services: ServiceItem[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    setBusy(true);
    setDone(null);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/support-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id, details: f.get("details") }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not submit request");
        return;
      }
      const body = (await res.json()) as { kind?: string };
      setDone({
        id,
        message: body.kind === "ticket" ? "Ticket created — IT is on it." : "Request sent for approval — track it under Requests.",
      });
      setOpenId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {services.map((s) => {
        const isOpen = openId === s.id;
        return (
          <Card key={s.id} className="flex flex-col">
            <div className="flex items-start justify-between gap-2 px-5 pt-4">
              <div>
                <h3 className="font-semibold text-primary">{s.name}</h3>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">{s.description || "No description."}</p>
              </div>
              <Badge tone={CATEGORY_TONE[s.category] ?? "neutral"}>{s.category}</Badge>
            </div>
            <div className="flex items-center gap-2 px-5 py-3 text-xs text-[var(--color-muted)]">
              {s.expectedDays != null && <span>~{s.expectedDays} day{s.expectedDays === 1 ? "" : "s"}</span>}
              <span>·</span>
              <span>{s.approvalRequired ? "Needs approval" : "Immediate"}</span>
            </div>
            {isOpen ? (
              <form
                onSubmit={(e) => void submit(e, s.id)}
                className="space-y-2 border-t border-[var(--color-line)] px-5 py-3"
              >
                <label className="block text-xs font-medium">
                  Details
                  <textarea
                    name="details"
                    maxLength={5000}
                    placeholder={s.approvalRequired ? "What do you need and why?" : "Describe what you need"}
                    className={`${input} mt-1 min-h-20`}
                  />
                </label>
                {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                <div className="flex items-center gap-2">
                  <button type="submit" disabled={busy} className={`${btn.primary} ${btn.small}`}>
                    {busy ? "Submitting…" : s.approvalRequired ? "Request" : "Request now"}
                  </button>
                  <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => setOpenId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="border-t border-[var(--color-line)] px-5 py-3">
                <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => { setOpenId(s.id); setDone(null); setError(null); }}>
                  Request
                </button>
              </div>
            )}
            {done && done.id === s.id && openId === null && (
              <p role="status" className="px-5 pb-3 text-xs text-success">{done.message}</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}