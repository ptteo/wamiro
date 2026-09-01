"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { btn, input } from "./ui";

export function AddMemberForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-2 border-t border-[var(--color-line)] px-5 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const f = new FormData(e.currentTarget);
        try {
          const res = await fetch(`/api/v1/projects/${projectId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: f.get("email") }),
          });
          if (!res.ok) {
            const d = (await res.json()) as { error?: { message?: string } };
            setError(d.error?.message ?? "Could not add member");
            return;
          }
          (e.target as HTMLFormElement).reset();
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        type="email"
        name="email"
        className={input}
        placeholder="Add member by email"
        required
      />
      <button type="submit" disabled={busy} className={`${btn.secondary} ${btn.small} w-full`}>
        {busy ? "Adding…" : "Add member"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
