"use client";

import { useState } from "react";

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

  return (
    <button
      type="button"
      title={on ? "Remove from favorites" : "Add to favorites"}
      aria-label={on ? "Remove from favorites" : "Add to favorites"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/v1/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, refId }),
          });
          setOn(!on);
        } finally {
          setBusy(false);
        }
      }}
      className={`text-lg leading-none transition hover:scale-110 ${on ? "text-amber-400" : "text-disabled"}`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
