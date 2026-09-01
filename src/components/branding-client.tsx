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
      window.location.reload(); // pick up new logo everywhere
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 px-5 py-4">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-4">
        <img
          src={`/api/v1/org/branding/logo?v=${Date.now()}`}
          alt={`${orgName} logo`}
          className="h-14 w-14 rounded-lg border border-border-default object-contain"
        />
        <div className="text-xs text-secondary">
          <p>Displayed in the sidebar and across the workspace.</p>
          <p>PNG, JPEG or WebP · max 2 MB.</p>
        </div>
      </div>

      {canManage && (
        <form
          className="flex flex-wrap items-center gap-2"
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
            className="rounded-lg border border-border-default px-3 py-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-subtle file:px-3 file:py-1.5 file:text-xs"
          />
          <button type="submit" disabled={busy} className={btn.primary}>
            Upload
          </button>
          {hasLogo && (
            <button
              type="button"
              disabled={busy}
              onClick={() => call("DELETE")}
              className={`${btn.danger} ${btn.small}`}
            >
              Remove logo
            </button>
          )}
        </form>
      )}
    </div>
  );
}
