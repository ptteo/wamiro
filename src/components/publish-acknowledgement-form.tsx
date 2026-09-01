"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { btn, input } from "./ui";

export function PublishAcknowledgementForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <div className="border-t border-[var(--color-line)] px-5 py-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className={`${btn.secondary} ${btn.small}`}>
          {open ? "Cancel" : "Publish new acknowledgement"}
        </button>
      </div>
      {open && (
        <form
          className="space-y-3 border-t border-[var(--color-line)] px-5 py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const f = new FormData(e.currentTarget);
            try {
              const res = await fetch("/api/v1/admin/acknowledgements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: f.get("title"), body: f.get("body") }),
              });
              if (!res.ok) {
                const d = (await res.json()) as { error?: { message?: string } };
                setError(d.error?.message ?? "Publish failed");
                return;
              }
              setOpen(false);
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm font-medium">
            Title
            <input name="title" className={`${input} mt-1`} required minLength={3} maxLength={200} />
          </label>
          <label className="block text-sm font-medium">
            Policy text
            <textarea name="body" className={`${input} mt-1 min-h-32`} required minLength={10} />
          </label>
          <div>
            <button type="submit" disabled={busy} className={btn.primary}>
              Publish to all employees
            </button>
            {error && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        </form>
      )}
    </>
  );
}
