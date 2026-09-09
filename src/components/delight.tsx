"use client";

/**
 * Phase 6 §8 — delight micro-moments. Every effect here is ≤1s, subtle, and
 * fires once per user per moment (persisted server-side in user preferences
 * so replays don't cheapen them). All animation is pure CSS and collapses
 * under prefers-reduced-motion via the global override in globals.css.
 */

import { useEffect, useRef, useState } from "react";

/* --------------------------------------------------- once-per-user markers */

const CACHE_KEY = "wamiro-delight-seen";
let cache: Set<string> | null = null;

function readCache(): Set<string> {
  if (cache) return cache;
  try {
    cache = new Set(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]") as string[]);
  } catch {
    cache = new Set();
  }
  return cache;
}

/** True the first time a moment is seen; persists locally per browser. */
export function shouldCelebrate(key: string): boolean {
  if (typeof window === "undefined") return false;
  const seen = readCache();
  if (seen.has(key)) return false;
  seen.add(key);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...seen]));
  } catch {
    /* private mode — moment just replays per session */
  }
  return true;
}

/** Test/dev escape hatch: forget a moment so it can fire again. */
export function resetDelight(key?: string) {
  if (!key) {
    cache = null;
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* noop */
    }
    return;
  }
  const seen = readCache();
  seen.delete(key);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...seen]));
  } catch {
    /* noop */
  }
}

/* ------------------------------------------------------------- confetti */

const CONFETTI_COLORS = ["#BD660E", "#D97B2E", "#E88E42", "#FDF0E5", "#242424"];
const PIECE_COUNT = 18;

/**
 * Fixed-position confetti burst from a viewport point (px). Auto-removes
 * itself; inert under reduced motion (the global override stops the keyframes
 * but the pieces fade via the 100% opacity state — we also just skip the DOM
 * entirely when the user prefers reduced motion).
 */
export function burstConfetti(origin?: { x: number; y: number }) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 3;

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "var(--z-toast)",
  } as CSSStyleDeclaration);
  document.body.appendChild(host);

  for (let i = 0; i < PIECE_COUNT; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const dx = (Math.random() - 0.5) * 260;
    const rot = (Math.random() - 0.5) * 720;
    const size = 5 + Math.random() * 5;
    Object.assign(piece.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${size}px`,
      height: `${size * 0.6}px`,
      borderRadius: "1px",
      background: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
      // css vars consumed by the confetti-fall keyframes
      "--dx": `${dx}px`,
      "--rot": `${rot}deg`,
      animationDelay: `${Math.random() * 120}ms`,
    } as unknown as CSSStyleDeclaration);
    host.appendChild(piece);
  }

  window.setTimeout(() => host.remove(), 1400);
}

/* ------------------------------------------------ first-clock-in check */

/**
 * Draws a brand-colored check with a stroke animation. Mount when the moment
 * fires; removes itself after the draw completes.
 */
export function CheckBurst({ className }: { className?: string }) {
  const [gone, setGone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timer.current = setTimeout(() => setGone(true), 1600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (gone) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className ?? "h-6 w-6 text-success"}
    >
      <path
        d="M4 12.5 10 18.5 20 6.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="check-draw"
      />
    </svg>
  );
}
