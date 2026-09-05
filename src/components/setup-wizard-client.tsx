"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, PartyPopper } from "lucide-react";

import { BrandingClient } from "./branding-client";
import { Badge, btn, input } from "./ui";

interface Step {
  key: string;
  label: string;
  done: boolean;
}

interface Member {
  id: string;
  name: string;
  email: string;
  roleLabel?: string;
}

const STEP_ORDER = ["brand", "team", "announce"] as const;
const ROLES = ["employee", "manager", "hr_admin", "admin"] as const;

function StepShell({
  index,
  done,
  active,
  title,
  children,
}: {
  index: number;
  done: boolean;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border bg-surface p-5 transition ${
        active ? "border-brand/50 ring-1 ring-brand/20" : "border-border-default"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            done ? "bg-success-subtle text-success" : active ? "bg-brand text-on-brand" : "bg-surface-subtle text-tertiary"
          }`}
          aria-hidden
        >
          {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : index}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-primary">
            Step {index}: {title}
          </h2>
          {done && <p className="text-xs text-success">Complete</p>}
        </div>
      </div>
      <div className="mt-4">{done ? null : children}</div>
    </section>
  );
}

export function SetupWizardClient({
  data,
}: {
  data: {
    orgName: string;
    primaryColor: string;
    hasLogo: boolean;
    canBrand: boolean;
    canInvite: boolean;
    canAnnounce: boolean;
    steps: Step[];
    done: number;
    total: number;
    plan: string;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [seatInfo, setSeatInfo] = useState<{ activeSeats: number; seatLimit: number | null } | null>(null);
  const [welcomeTitle, setWelcomeTitle] = useState(`Welcome to ${data.orgName} 👋`);
  const [welcomeBody, setWelcomeBody] = useState(
    "Hello everyone! This is our Wamiro workspace — one place for company updates, requests, help, and how we work together. Welcome aboard!",
  );

  const done = (key: string) => data.steps.find((s) => s.key === key)?.done ?? false;
  const firstIncomplete = STEP_ORDER.find((key) => !done(key));
  const allDone = firstIncomplete === undefined;
  const progress = Math.round((data.done / data.total) * 100);

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"),
          email: f.get("email"),
          roleKey: f.get("role") || "employee",
        }),
      });
      const body = (await res.json()) as {
        error?: { message?: string };
        tempPassword?: string;
      };
      if (!res.ok) {
        setError(body.error?.message ?? "Could not send the invite");
        return;
      }
      setMessage(
        body.tempPassword
          ? `Invited! Share the temporary password with ${String(f.get("name"))}: ${body.tempPassword}`
          : "Invite sent! They'll receive an email with sign-in instructions.",
      );
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function loadMembers() {
    if (members) return;
    const res = await fetch("/api/v1/people");
    if (res.ok) {
      const d = (await res.json()) as { people?: { userId?: string; name?: string; email?: string }[] };
      setMembers((d.people ?? []).map((p) => ({ id: p.userId ?? "", name: p.name ?? "", email: p.email ?? "" })));
    }
    const b = await fetch("/api/v1/billing");
    if (b.ok) {
      const s = (await b.json()) as { activeSeats: number; seatLimit: number | null };
      setSeatInfo(s);
    }
  }

  async function publishWelcome(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: welcomeTitle, body: welcomeBody }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not publish the announcement");
        return;
      }
      setMessage("Welcome note published — everyone will see it on Home.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (allDone) {
    return (
      <div className="rounded-xl border border-border-default bg-surface p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle text-success">
          <PartyPopper className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <h2 className="mt-3 text-lg font-semibold text-primary">Your workspace is ready 🎉</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-secondary">
          {data.orgName} is fully set up. Invite more teammates any time from the People area, and explore your Home
          feed.
        </p>
        <Link href="/home" className={`${btn.primary} mt-5`}>
          Open your workspace <ArrowRight className="ml-1 inline h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">{message}</p>
      ) : null}

      {/* progress */}
      <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3">
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-secondary">
              {data.done} of {data.total} steps complete
            </span>
            <span className="text-tertiary">{progress}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border-subtle">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.max(6, progress)}%` }} />
          </div>
        </div>
        <Badge tone="brand">{data.plan} plan</Badge>
      </div>

      <StepShell index={1} done={done("brand")} active={firstIncomplete === "brand"} title="Add your branding">
        {data.canBrand ? (
          <div className="rounded-lg border border-border-subtle p-4">
            <BrandingClient hasLogo={data.hasLogo} orgName={data.orgName} canManage />
          </div>
        ) : (
          <p className="text-sm text-tertiary">Ask an administrator with Settings access to add the logo.</p>
        )}
      </StepShell>

      <StepShell index={2} done={done("team")} active={firstIncomplete === "team"} title="Invite your team">
        {data.canInvite ? (
          <div>
            <button type="button" onClick={() => void loadMembers()} className={`${btn.secondary} ${btn.small}`}>
              {members ? "Refresh teammates" : "Show current teammates"}
            </button>
            {members && members.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {members.slice(0, 12).map((m) => (
                  <li key={m.id} className="rounded-full border border-border-default bg-surface px-2.5 py-0.5 text-xs text-secondary">
                    {m.name}
                    {m.email ? <span className="text-tertiary"> · {m.email}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {seatInfo ? (
              <p className="mt-2 text-xs text-tertiary">
                {seatInfo.activeSeats} active of {seatInfo.seatLimit ?? "unlimited"} seats on your plan
              </p>
            ) : null}
            <form onSubmit={invite} className="mt-3 grid gap-2 sm:grid-cols-3">
              <input name="name" required minLength={2} placeholder="Full name" className={`${input} h-9`} />
              <input name="email" type="email" required placeholder="name@company.com" className={`${input} h-9`} />
              <select name="role" className={`${input} h-9`} defaultValue="employee">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r === "hr_admin" ? "HR admin" : r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
              <div className="sm:col-span-3">
                <button type="submit" disabled={busy} className={`${btn.primary} ${btn.small}`}>
                  {busy ? "Sending…" : "Invite teammate"}
                </button>
              </div>
            </form>
            <p className="mt-2 text-xs text-tertiary">
              Tip: start with your managers and an HR admin — they can then help grow the workspace.
            </p>
          </div>
        ) : (
          <p className="text-sm text-tertiary">Ask an administrator to invite teammates.</p>
        )}
      </StepShell>

      <StepShell index={3} done={done("announce")} active={firstIncomplete === "announce"} title="Post a welcome note">
        {data.canAnnounce ? (
          <form onSubmit={publishWelcome} className="space-y-2">
            <input
              value={welcomeTitle}
              onChange={(e) => setWelcomeTitle(e.target.value)}
              maxLength={150}
              className={`${input} h-9`}
            />
            <textarea
              value={welcomeBody}
              onChange={(e) => setWelcomeBody(e.target.value)}
              maxLength={5000}
              className={`${input} min-h-24`}
            />
            <button type="submit" disabled={busy || welcomeTitle.trim().length < 3} className={`${btn.primary} ${btn.small}`}>
              {busy ? "Publishing…" : "Publish to everyone"}
            </button>
            <p className="text-xs text-tertiary">Published announcements appear on every teammate&apos;s Home feed.</p>
          </form>
        ) : (
          <p className="text-sm text-tertiary">Ask an administrator to post the welcome announcement.</p>
        )}
      </StepShell>
    </div>
  );
}