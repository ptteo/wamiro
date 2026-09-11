"use client";

import { useRef, useState } from "react";

import { toast } from "@/components/toaster";
import { cx } from "@/lib/cx";

export function FavoriteStar({
  kind,
  refId,
  starred,
}: {
  kind: "project" | "article";
  refId: string;
  starred: boolean;
}) {
  const [on, setOn] = useState(starred);
  const [busy, setBusy] = useState(false);
  const prev = useRef(starred);
  prev.current = starred;

  async function toggle() {
    if (busy) return;
    const next = !on;
    setOn(next); // optimistic (Phase 6 §2)
    setBusy(true);
    try {
      const res = await fetch("/api/v1/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, refId }),
      });
      if (!res.ok) throw new Error("Could not update favorite");
    } catch (e) {
      setOn(prev.current); // rollback
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      title={on ? "Remove from favorites" : "Add to favorites"}
      aria-label={on ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={on}
      disabled={busy}
      onClick={toggle}
      className={cx(
        "press text-lg leading-none transition-transform hover:scale-110",
        on ? "text-amber-400" : "text-disabled",
      )}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
