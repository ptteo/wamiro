"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { btn, input } from "./ui";

export function InviteTeammateForm({
  defaultRole = "employee",
  teamOnly = false,
}: {
  defaultRole?: string;
  teamOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; inviteUrl?: string; linked?: boolean } | null>(null);

  if (!open) {
    return (
      <div className="space-y-2">
        {result ? <InviteResult email={result.email} inviteUrl={result.inviteUrl} linked={result.linked} /> : null}
        <button type="button" className={`${btn.primary} ${btn.small}`} onClick={() => setOpen(true)}>
          <UserPlus className="h-3.5 w-3.5" />
          Invite teammate
        </button>
      </div>
    );
  }

  return (
    <form
      className="w-full max-w-lg space-y-2 rounded-lg border border-border-subtle bg-surface p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const f = new FormData(e.currentTarget);
        try {
          const res = await fetch("/api/v1/invitations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: f.get("name"),
              email: f.get("email"),
              roleKey: teamOnly ? "employee" : (f.get("roleKey") || defaultRole),
            }),
          });
          const d = (await res.json()) as {
            ok?: boolean;
            inviteUrl?: string;
            linked?: boolean;
            error?: { message?: string };
          };
          if (!res.ok) {
            setError(d.error?.message ?? "Could not send the invite");
            return;
          }
          setResult({ email: String(f.get("email")), inviteUrl: d.inviteUrl, linked: d.linked });
          setOpen(false);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input name="name" required minLength={2} placeholder="Full name" className={`${input} h-9`} />
        <input name="email" type="email" required placeholder="name@company.com" className={`${input} h-9`} />
        {teamOnly ? (
          <input type="hidden" name="roleKey" value="employee" />
        ) : (
          <select name="roleKey" className={`${input} h-9`} defaultValue={defaultRole}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="hr_admin">HR admin</option>
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <button type="submit" className={`${btn.primary} ${btn.small}`} disabled={busy}>
          {busy ? "Sending…" : "Send invite link"}
        </button>
        <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function InviteResult({
  email,
  inviteUrl,
  linked,
}: {
  email: string;
  inviteUrl?: string;
  linked?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (linked) {
    return <p className="text-sm text-success">{email} already has a Wamiro account — they can sign in to this company.</p>;
  }
  return (
    <div className="rounded-md border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">
      <p className="font-medium">{email} invited.</p>
      {inviteUrl ? (
        <p className="mt-1 break-all text-xs">
          Copy this link if email is not configured:{" "}
          <code className="font-mono text-primary">{inviteUrl}</code>{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void navigator.clipboard.writeText(inviteUrl).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </p>
      ) : (
        <p className="mt-1 text-xs">They will get a 7-day email link to set their own password.</p>
      )}
    </div>
  );
}
