"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Inline boot script — runs before paint to avoid a flash of the wrong theme. */
export const themeInitScript = `
(function(){try{
  var t = localStorage.getItem("wamiro-theme") || "system";
  var dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
}catch(e){}})();
`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    setTheme((localStorage.getItem("wamiro-theme") as Theme) || "system");
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem("wamiro-theme") || "system") === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function cycle() {
    const next: Theme =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    localStorage.setItem("wamiro-theme", next);
    apply(next);
    setTheme(next);
    // R5 §17 — persist to the user's global preferences (best-effort).
    fetch("/api/v1/me/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "theme", value: next }),
      keepalive: true,
    }).catch(() => {});
  }

  const label = theme === "system" ? "Theme: system" : theme === "dark" ? "Theme: dark" : "Theme: light";
  const icon = theme === "dark" ? "◐" : theme === "light" ? "☀" : "◑";

  return (
    <button
      type="button"
      onClick={cycle}
      title={label}
      aria-label={label}
      className="rounded-lg border border-border-default px-2 py-1 text-xs text-secondary hover:bg-surface-hover"
    >
      {icon}
    </button>
  );
}
