"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { replayTour } from "@/components/product-tour";
import { btn, input } from "./ui";

export function HelpActions({ canAsk }: { canAsk: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {canAsk ? (
        <a href="/assistant" className={btn.primary}>
          Ask the assistant
        </a>
      ) : null}
      <a href="#contact-support" className={btn.secondary}>
        Contact support
      </a>
      <button type="button" className={btn.secondary} onClick={() => replayTour()}>
        Replay tour
      </button>
    </div>
  );
}

export function ContactSupportForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/help/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.get("title"),
          description: f.get("description"),
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(d.error?.message ?? "Could not send to Wamiro support");
        return;
      }
      setOk(true);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="contact-support" onSubmit={submit} className="space-y-3">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {ok ? <p className="text-sm text-success">Sent to Wamiro support. We will reply on this ticket.</p> : null}
      <label className="block text-sm font-medium text-primary">
        Subject
        <input name="title" required minLength={3} maxLength={300} className={`${input} mt-1`} />
      </label>
      <label className="block text-sm font-medium text-primary">
        What happened?
        <textarea name="description" required minLength={5} maxLength={10_000} className={`${input} mt-1 min-h-24`} />
      </label>
      <button type="submit" disabled={busy} className={btn.primary}>
        {busy ? "Sending…" : "Send to Wamiro support"}
      </button>
      <p className="text-xs text-tertiary">This opens a platform ticket — not your company’s IT queue.</p>
    </form>
  );
}
