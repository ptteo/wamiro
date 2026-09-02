"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

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

/**
 * Command palette (Ctrl/Cmd+K). Native implementation — no cmdk dependency.
 * Keyboard: ↑↓ move, Enter open, Esc close.
 */
export function CommandPalette({ nav }: { nav: NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
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
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // debounce people search
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

  const navMatches = nav.filter((n) =>
    n.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const pick = useCallback(
    (item: { href: string }) => {
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full items-center justify-between rounded-md border border-border-subtle bg-surface-subtle/60 px-2.5 text-[13px] text-tertiary transition hover:border-border-default hover:bg-surface-hover hover:text-secondary"
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
  const items = [
    ...navMatches.map((n) => ({ kind: "nav" as const, href: n.href, title: n.label, subtitle: "Navigate" })),
    ...results.map((r) => ({
      kind: r.type as "person" | "article" | "document" | "announcement" | "discussion",
      href: r.href,
      title: r.title,
      subtitle: `${typeLabel[r.type] ?? r.type} · ${r.subtitle}`,
    })),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--color-line)] bg-surface shadow-xl"
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
              pick(items[active]);
            }
          }}
          placeholder="Search people, articles, jump to a page…"
          aria-label="Search"
          className="w-full border-b border-[var(--color-line)] px-4 py-3.5 text-sm outline-none placeholder:text-tertiary"
        />
        <ul role="listbox" className="max-h-80 overflow-auto p-1.5">
          {items.length === 0 && query.trim().length >= 2 && (
            <li className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
              No matches for “{query.trim()}”
            </li>
          )}
          {items.map((item, i) => (
            <li key={`${item.kind}-${item.title}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  i === active ? "bg-[var(--color-brand-50)] text-[var(--color-brand-700)]" : ""
                }`}
              >
                <span className="font-medium">{item.title}</span>
                <span className="text-xs text-[var(--color-muted)]">{item.subtitle}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-[var(--color-line)] bg-surface-subtle px-4 py-2 text-[11px] text-[var(--color-muted)]">
          ↑↓ navigate · Enter open · Esc close
        </div>
      </div>
    </div>
  );
}
