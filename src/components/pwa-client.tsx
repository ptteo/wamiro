"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker so the app is installable and push
 * subscriptions can attach to it. Deliberately silent: no notification
 * permission is requested here — that happens only from the explicit
 * "Enable push" control on the Notifications page.
 */
export function PwaClient() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Keep the worker current after a deploy.
        if (!cancelled) void reg.update();
      })
      .catch(() => {
        /* offline-first environments / private mode — non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
