"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

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

export function ThemeToggle({
  showLabel = false,
}: {
  showLabel?: boolean;
}) {
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
    fetch("/api/v1/me/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "theme", value: next }),
      keepalive: true,
    }).catch(() => {});
  }

  const label =
    theme === "system" ? "Theme: system" : theme === "dark" ? "Theme: dark" : "Theme: light";
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <button
      type="button"
      onClick={cycle}
      title={label}
      aria-label={label}
      className={
        showLabel
          ? "flex h-9 w-full items-center gap-2 rounded-md px-1.5 text-[13px] font-medium text-primary hover:bg-surface-hover"
          : "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-default text-secondary hover:bg-surface-hover hover:text-primary"
      }
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}
