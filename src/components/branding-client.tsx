"use client";

import { useState } from "react";

import { btn } from "./ui";

interface Props {
  hasLogo: boolean;
  orgName: string;
  canManage: boolean;
}

export function BrandingClient({ hasLogo, orgName, canManage }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: string, body?: FormData): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/org/branding", {
        method,
        body: body ?? undefined,
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: { message?: string } };
        setError(d.error?.message ?? "Action failed");
        return false;
      }
      window.location.reload();
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-5">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element -- tenant logo from our API
          <img
            src={`/api/v1/org/branding/logo?v=${Date.now()}`}
            alt={`${orgName} logo`}
            className="h-16 w-16 rounded-xl border border-border-default bg-surface-subtle object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : null}
        <p className="text-xs leading-relaxed text-secondary">
          PNG, JPEG or WebP · max 2 MB.
          {!canManage ? " You can view the logo, but only an administrator can change it." : null}
        </p>
      </div>

      {canManage ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (await call("POST", f)) (e.target as HTMLFormElement).reset();
          }}
        >
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp"
            required
            className="min-w-0 flex-1 rounded-md border border-border-default px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-subtle file:px-3 file:py-1.5 file:text-xs"
          />
          <button type="submit" disabled={busy} className={btn.primary}>
            Upload
          </button>
          {hasLogo ? (
            <button type="button" disabled={busy} onClick={() => call("DELETE")} className={btn.danger}>
              Remove logo
            </button>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
