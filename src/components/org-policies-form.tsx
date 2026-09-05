"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { btn, input } from "./ui";

export function OrgPoliciesForm({
  allowedEmailDomains,
  mfaMode,
  passwordMode,
}: {
  allowedEmailDomains: string[];
  mfaMode: string;
  passwordMode: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const f = new FormData(e.currentTarget);
    const domains = String(f.get("domains") ?? "")
      .split(/[\s,]+/)
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    try {
      const res = await fetch("/api/v1/org/policies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedEmailDomains: domains,
          mfaMode: f.get("mfaMode"),
          passwordMode: f.get("passwordMode"),
        }),
      });
      const d = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(d.error?.message ?? "Could not save policies");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {saved ? <p className="text-sm text-success">Saved.</p> : null}
      <label className="block text-sm font-medium">
        Allowed email domains
        <input
          name="domains"
          className={`${input} mt-1`}
          defaultValue={allowedEmailDomains.join(", ")}
          placeholder="company.com (empty = any domain)"
        />
        <span className="mt-1 block text-xs text-tertiary">
          Invites and password sign-in must match these hosts. Leave empty to allow any mailbox.
        </span>
      </label>
      <label className="block text-sm font-medium">
        MFA policy
        <select name="mfaMode" className={`${input} mt-1`} defaultValue={mfaMode}>
          <option value="optional">Optional</option>
          <option value="required_admins">Required for admins</option>
          <option value="required_all">Required for everyone</option>
        </select>
      </label>
      <label className="block text-sm font-medium">
        Password changes
        <select name="passwordMode" className={`${input} mt-1`} defaultValue={passwordMode}>
          <option value="self_service">Self-service (default)</option>
          <option value="managed">Managed — admin must approve</option>
        </select>
      </label>
      <button type="submit" className={btn.primary} disabled={busy}>
        {busy ? "Saving…" : "Save policies"}
      </button>
    </form>
  );
}
