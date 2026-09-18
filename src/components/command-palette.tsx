"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Clock3, Search } from "lucide-react";

import { cx } from "@/lib/cx";

interface NavItem {
  href: string;
  label: string;
}
interface Result {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}
interface PaletteItem {
  kind: string;
  href: string;
  title: string;
  subtitle: string;
  /** action-mode only: prefilled prompt for the assistant */
  prompt?: string;
}

const RECENT_KEY = "wamiro-palette-recent";
const RECENT_MAX = 5;

function readRecent(): PaletteItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as PaletteItem[];
    return Array.isArray(raw) ? raw.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(item: PaletteItem) {
  try {
    const next = [item, ...readRecent().filter((r) => r.href !== item.href)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage full/private — recents just don't persist */
  }
}

/**
 * Command palette (Phase 6 §5). Ctrl/Cmd+K anywhere (also `/` when not typing
 * in a field). Native implementation — no cmdk dependency. Keyboard: ↑↓ move,
 * Enter open, Esc close. Recent jumps persist locally.
 */
export function CommandPalette({ nav }: { nav: NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<PaletteItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(false);
  openRef.current = open;

  // Global shortcuts: ⌘K / Ctrl+K toggles from anywhere; "/" opens when not
  // typing in an input/textarea/select/contenteditable.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !openRef.current) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        const typing =
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          target?.isContentEditable === true;
        if (!typing) {
          e.preventDefault();
          setOpen(true);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActive(0);
      setRecent(readRecent());
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Listen for external open requests (mobile menu button etc.). A second
  // delayed echo covers clicks that land while hydration is still in flight.
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("wamiro:open-palette", onOpen);
    window.addEventListener("wamiro:open-palette-late", onOpen);
    return () => {
      window.removeEventListener("wamiro:open-palette", onOpen);
      window.removeEventListener("wamiro:open-palette-late", onOpen);
    };
  }, []);

  // Consume a request recorded before this component mounted: the launcher
  // sets a window flag, so an early click is never lost to listener timing.
  useEffect(() => {
    const w = window as typeof window & { __wamiroPaletteOpen?: boolean };
    if (w.__wamiroPaletteOpen) {
      w.__wamiroPaletteOpen = false;
      setOpen(true);
    }
  }, []);

  // debounce server search
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = (await res.json()) as { results: Result[] };
          setResults(data.results ?? []);
          setActive(0);
        }
      } catch {
        /* palette stays usable offline */
      }
    }, 150);
    return () => clearTimeout(t);
  }, [query, open]);

  const navMatches = useMemo(
    () => nav.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase())),
    [nav, query],
  );

  // Phase 7 (§2.2): "Ask AI" — an action-mode item pinned above results.
  // The prompt rides sessionStorage; the assistant page consumes it once and
  // prefills the composer.
  const askAi = useMemo(() => {
    const q = query.trim();
    return {
      kind: "action",
      href: "/assistant",
      title: q.length > 0 ? `Ask AI: “${q.length > 60 ? q.slice(0, 60) + "…" : q}”` : "Ask AI",
      subtitle: "Assistant",
      prompt: q.length >= 2 ? q : "",
    };
  }, [query]);

  const pick = useCallback(
    (item: PaletteItem) => {
      setOpen(false);
      if (item.kind === "action") {
        try {
          if (item.prompt) sessionStorage.setItem("wamiro-ai-prompt", item.prompt);
          else sessionStorage.removeItem("wamiro-ai-prompt");
        } catch {
          /* storage unavailable — assistant just opens empty */
        }
        router.push("/assistant");
        return;
      }
      pushRecent(item);
      router.push(item.href);
    },
    [router],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press flex h-8 w-full items-center justify-between rounded-md border border-border-subtle bg-surface-subtle/60 px-2.5 text-[13px] text-tertiary transition hover:border-border-default hover:bg-surface-hover hover:text-secondary"
      >
        <span className="inline-flex items-center gap-2">
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
          Search
        </span>
        <kbd className="rounded border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[10px] text-tertiary">
          ⌘K
        </kbd>
      </button>
    );
  }

  const typeLabel: Record<string, string> = {
    person: "Person",
    article: "Knowledge",
    document: "Document",
    announcement: "Announcement",
    discussion: "Discussion",
    vendor: "Vendor",
    candidate: "Candidate",
  };

  const serverItems = results.map((r) => ({
    kind: r.type as string,
    href: r.href,
    title: r.title,
    subtitle: `${typeLabel[r.type] ?? r.type} · ${r.subtitle}`,
  }));
  const navItems = navMatches.map((n) => ({
    kind: "nav",
    href: n.href,
    title: n.label,
    subtitle: "Navigate",
  }));
  // query mode: Ask AI first (action mode), then server hits, then nav;
  // empty query: Ask AI, recents, nav
  const items: PaletteItem[] = [askAi, ...(query.trim().length >= 2 ? serverItems : recent), ...navItems];

  const recentHrefs = new Set(recent.map((r) => r.href));

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center bg-black/40 px-4 pt-24 transition-opacity"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{ animation: "enter-rise var(--dur) var(--ease) both" }}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border-default bg-surface shadow-xl"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && items[active]) {
              pick(items[active]!);
            }
          }}
          placeholder="Search people, articles, jump to a page…"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="wamiro-palette-list"
          className="w-full border-b border-border-subtle px-4 py-3.5 text-sm text-primary outline-none placeholder:text-tertiary"
        />
        <ul id="wamiro-palette-list" role="listbox" className="max-h-80 overflow-auto p-1.5">
          {items.length === 0 && query.trim().length >= 2 && (
            <li className="px-3 py-6 text-center text-sm text-tertiary">
              No matches for “{query.trim()}”
            </li>
          )}
          {items.map((item, i) => (
            <li key={`${item.kind}-${item.href}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
                className={cx(
                  "press flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm",
                  i === active ? "bg-brand-subtle text-brand-text" : "text-primary",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {query.trim().length < 2 && recentHrefs.has(item.href) ? (
                    <Clock3 className="h-3.5 w-3.5 shrink-0 text-tertiary" strokeWidth={1.75} />
                  ) : null}
                  <span className="truncate font-medium">{item.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-tertiary">
                  {item.subtitle}
                  {i === active ? <ArrowRight className="h-3 w-3" strokeWidth={1.75} /> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border-subtle bg-surface-subtle px-4 py-2 text-[11px] text-tertiary">
          ↑↓ navigate · Enter open · Esc close · / opens from anywhere
        </div>
      </div>
    </div>
  );
}

/**
 * Tiny launcher for touch surfaces without the sidebar (mobile top bar).
 * Robust against listener timing: it dispatches the open event AND sets a
 * window flag that <CommandPalette> consumes on mount, so a click that lands
 * before the palette hydrates still opens it.
 */
export function PaletteOpenButton({ className }: { className?: string }) {
  const openPalette = useCallback(() => {
    if (typeof window !== "undefined") {
      (window as typeof window & { __wamiroPaletteOpen?: boolean }).__wamiroPaletteOpen = true;
      window.dispatchEvent(new Event("wamiro:open-palette"));
      window.setTimeout(() => window.dispatchEvent(new Event("wamiro:open-palette-late")), 350);
    }
  }, []);
  // Render unconditionally: a `typeof window` branch inside render is a
  // hydration mismatch (server span vs client button) and crashes React's
  // commit with "cannot read properties of null (reading 'parentNode')".
  return (
    <button
      type="button"
      aria-label="Open search"
      onClick={openPalette}
      className={
        className ??
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-default bg-surface text-secondary transition hover:bg-surface-hover hover:text-primary"
      }
    >
      <Search className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}
