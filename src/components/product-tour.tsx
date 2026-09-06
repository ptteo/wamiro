"use client";

/**
 * ponytail: self-built spotlight. Swap this file if a tour library is ever needed.
 */
import { useCallback, useEffect, useState } from "react";

import { TOURS, TOUR_VERSION, clearTour, markTourFinished, shouldStartTour, tourKeyFromPath, type TourState } from "@/lib/tour";
import { btn } from "./ui";

async function loadTourState(): Promise<TourState> {
  const res = await fetch("/api/v1/me/preferences");
  if (!res.ok) return {};
  const d = (await res.json()) as { preferences?: { tourState?: TourState } };
  return (d.preferences?.tourState as TourState) ?? {};
}

async function saveTourState(next: TourState) {
  await fetch("/api/v1/me/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "tourState", value: next, orgScoped: true }),
  });
}

export function ProductTourHost({ pathname }: { pathname: string }) {
  const key = tourKeyFromPath(pathname);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [state, setState] = useState<TourState>({});

  const steps = key ? TOURS[key] : [];
  const current = steps[step];

  const measure = useCallback(() => {
    if (!current) {
      setBox(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    setBox(el?.getBoundingClientRect() ?? null);
  }, [current]);

  const start = useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadTourState().then((s) => {
      if (cancelled) return;
      setState(s);
      if (key && shouldStartTour(s, key, TOUR_VERSION)) start();
      else if (!key) setActive(false);
    });
    return () => {
      cancelled = true;
    };
  }, [key, start]);

  useEffect(() => {
    function onReplay() {
      const target = key ?? "home";
      const next = clearTour(state, target);
      setState(next);
      void saveTourState(next);
      if (!key) {
        window.location.assign("/home");
        return;
      }
      start();
    }
    window.addEventListener("wamiro:replay-tour", onReplay);
    return () => window.removeEventListener("wamiro:replay-tour", onReplay);
  }, [key, start, state]);

  useEffect(() => {
    if (!active) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, measure]);

  async function finish(skipped: boolean) {
    if (!key) return;
    const next = markTourFinished(state, key, skipped, TOUR_VERSION);
    setState(next);
    setActive(false);
    await saveTourState(next);
  }

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        void finish(true);
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (step + 1 >= steps.length) void finish(false);
        else setStep((n) => n + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStep((n) => Math.max(0, n - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!active || !key || !current) return null;

  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pad = 8;
  const highlight = box
    ? {
        top: box.top - pad,
        left: box.left - pad,
        width: box.width + pad * 2,
        height: box.height + pad * 2,
      }
    : null;
  const tipTop = highlight ? highlight.top + highlight.height + 12 : 80;
  const rail = window.innerWidth >= 768 ? 288 : 0;
  const tipLeft = highlight
    ? Math.min(Math.max(16 + rail, highlight.left), window.innerWidth - 340)
    : 16 + rail;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
    >
      <div
        className="pointer-events-auto absolute inset-0 bg-ink/40 max-md:top-14 md:left-72"
        onClick={() => void finish(true)}
      />
      {highlight ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-brand ring-offset-2 ring-offset-transparent"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            transition: reduce ? "none" : "top 160ms ease, left 160ms ease, width 160ms ease, height 160ms ease",
          }}
        />
      ) : null}
      <div
        className="pointer-events-auto absolute w-[min(100%-2rem,20rem)] rounded-xl border border-border-default bg-surface p-4 shadow-lg"
        style={{ top: Math.min(tipTop, window.innerHeight - 180), left: tipLeft }}
      >
        <p className="text-[11px] font-medium uppercase tracking-wide text-tertiary">
          {key} · {step + 1} of {steps.length}
        </p>
        <h2 className="mt-1 text-sm font-semibold text-primary">{current.title}</h2>
        <p className="mt-1 text-sm text-secondary">{current.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => void finish(true)}>
            Skip
          </button>
          {step > 0 ? (
            <button type="button" className={`${btn.secondary} ${btn.small}`} onClick={() => setStep((n) => n - 1)}>
              Back
            </button>
          ) : null}
          <button
            type="button"
            className={`${btn.primary} ${btn.small}`}
            onClick={() => {
              if (step + 1 >= steps.length) void finish(false);
              else setStep((n) => n + 1);
            }}
          >
            {step + 1 >= steps.length ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function replayTour() {
  window.dispatchEvent(new Event("wamiro:replay-tour"));
}
