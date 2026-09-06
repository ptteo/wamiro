/**
 * First-login product tour — versioned per page.
 * ponytail: swap product-tour.tsx for a library if spotlight needs grow.
 */

export const TOUR_VERSION = 1;

export type TourKey = "home" | "attendance" | "leave" | "tickets" | "requests";

export interface TourStep {
  target: string;
  title: string;
  body: string;
}

export interface TourRecord {
  v: number;
  doneAt?: string;
  skippedAt?: string;
}

export type TourState = Partial<Record<TourKey, TourRecord>>;

export const TOURS: Record<TourKey, TourStep[]> = {
  home: [
    { target: "home-greeting", title: "Your Home", body: "This is your daily starting point — status, what needs you, and a clock-in." },
    { target: "home-clock", title: "Clock in from here", body: "Start your day with one click. Your hours show up on Attendance." },
    { target: "home-next", title: "What to do next", body: "Finish the checklist, then open Attendance, Leave, Tickets, or Requests when you need them." },
  ],
  attendance: [
    { target: "attendance-clock", title: "Clock in and out", body: "Use this control when you start and end a shift. Your week builds automatically." },
  ],
  leave: [
    { target: "leave-apply", title: "Apply for leave", body: "Pick a leave type and dates. Your manager reviews it from Approvals." },
  ],
  tickets: [
    { target: "tickets-new", title: "Ask for help", body: "Open a ticket for IT or workplace issues. Your company team will pick it up." },
  ],
  requests: [
    { target: "requests-new", title: "Submit a request", body: "Use a request type your company published — access, hardware, or anything they added." },
  ],
};

export function tourKeyFromPath(pathname: string): TourKey | null {
  if (pathname === "/home" || pathname.startsWith("/home/")) return "home";
  if (pathname === "/attendance" || pathname.startsWith("/attendance/")) return "attendance";
  if (pathname === "/leave" || pathname.startsWith("/leave/")) return "leave";
  if (pathname === "/tickets" || pathname.startsWith("/tickets/")) return "tickets";
  if (pathname === "/requests" || pathname.startsWith("/requests/")) return "requests";
  return null;
}

/** Start (or replay) when missing, skipped never, or stored version is stale. */
export function shouldStartTour(state: TourState | null | undefined, key: TourKey, version = TOUR_VERSION): boolean {
  const rec = state?.[key];
  if (!rec) return true;
  if (rec.v !== version) return true;
  return false;
}

export function markTourFinished(state: TourState, key: TourKey, skipped: boolean, version = TOUR_VERSION): TourState {
  return {
    ...state,
    [key]: {
      v: version,
      ...(skipped ? { skippedAt: new Date().toISOString() } : { doneAt: new Date().toISOString() }),
    },
  };
}

export function clearTour(state: TourState, key: TourKey): TourState {
  const next = { ...state };
  delete next[key];
  return next;
}
