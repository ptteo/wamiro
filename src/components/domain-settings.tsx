"use client";

import { useState } from "react";

import { Button } from "./ui";

interface Props {
  customDomain: string | null;
  verified: boolean;
  cnameTarget: string;
  /** Extra tenant hosts that also serve this instance (for the DNS hint). */
}

export function DomainSettings({ customDomain, verified, cnameTarget }: Props) {
  const [domain, setDomain] = useState(customDomain ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [state, setState] = useState({ customDomain, verified, cnameTarget });

  async function call(method: string, body?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/org/domain", {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body,
      });
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        customDomain?: string | null;
        verified?: boolean;
        cnameTarget?: string;
      } | null;
      if (!res.ok || !data) {
        setError(data?.error?.message ?? "Action failed");
        return;
      }
      setState({
        customDomain: data.customDomain ?? null,
        verified: data.verified ?? false,
        cnameTarget: data.cnameTarget ?? cnameTarget,
      });
      setDomain(data.customDomain ?? "");
      setNotice(
        method === "PUT"
          ? "Saved. Point a CNAME from this domain to the target below — the domain verifies itself as soon as traffic arrives."
          : "Domain removed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 font-mono text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none";

  return (
    <div className="space-y-4 p-4 sm:p-5">
      {error ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? <p className="rounded-lg border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">{notice}</p> : null}

      <p className="text-sm text-tertiary">
        Run the portal on your own domain. Your logo, colors and name already follow — this makes the address yours too.
      </p>

      {state.customDomain ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="rounded bg-surface-subtle px-2 py-1 font-mono text-sm text-primary">{state.customDomain}</code>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                state.verified ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${state.verified ? "bg-success" : "bg-warning"}`} aria-hidden />
              {state.verified ? "Verified — live" : "Waiting for DNS"}
            </span>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface-subtle p-3 font-mono text-xs text-primary">
            <p className="text-[11px] font-medium uppercase tracking-wide text-tertiary">DNS record to add</p>
            <p className="mt-1">
              {state.customDomain} <span className="text-tertiary">CNAME</span> → {state.cnameTarget}
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => call("DELETE")}
            className="!text-danger"
          >
            Remove domain
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="portal.acme.com"
            spellCheck={false}
            className={input}
          />
          <Button
            variant="primary"
            disabled={busy || !domain.trim()}
            onClick={() => call("PUT", JSON.stringify({ customDomain: domain }))}
          >
            Add domain
          </Button>
        </div>
      )}

      <p className="text-xs text-tertiary">
        Subdomain alternative: every workspace already has <code className="font-mono">{`https://<your-slug>.${cnameTarget}`}</code>{" "}
        — no DNS setup needed.
      </p>
    </div>
  );
}