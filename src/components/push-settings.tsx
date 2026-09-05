"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";

import { Button } from "./ui";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

interface Status {
  configured: boolean;
  publicKey: string | null;
  count: number;
}

export function PushSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    typeof Notification !== "undefined" ? Notification.permission : null,
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/push/subscribe");
      if (!res.ok) return;
      const data = (await res.json()) as Status;
      setStatus(data);
    } catch {
      /* server unavailable */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
        setMessage("This browser does not support push notifications.");
        return;
      }
      if (!status?.configured || !status.publicKey) {
        setMessage("Push is not configured on this workspace yet (VAPID keys).");
        return;
      }
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setMessage("Notifications are blocked in the browser. Allow them in site settings and retry.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(status.publicKey),
        }));
      const payload = sub.toJSON();
      const res = await fetch("/api/v1/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: payload.endpoint,
          p256dh: payload.keys?.p256dh,
          auth: payload.keys?.auth,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(d?.error?.message ?? "Could not save the subscription");
      }
      await refresh();
      setMessage("Browser notifications are on. You will be notified even when the portal is closed.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not enable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      if (typeof Notification !== "undefined" && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/v1/push/subscribe", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
      }
      await refresh();
      setMessage("Push notifications are off for this device.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;
  const enabled = (status.count ?? 0) > 0 || permission === "granted";

  return (
    <section className="rounded-lg border border-border-subtle bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
              enabled ? "bg-brand-subtle text-brand-text" : "bg-surface-subtle text-tertiary"
            }`}
          >
            {enabled ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-primary">
              {enabled ? "Browser notifications are on" : "Browser notifications"}
            </h2>
            <p className="mt-0.5 text-xs text-tertiary">
              {enabled
                ? `Delivered to ${status.count} device${status.count === 1 ? "" : "s"} even when the portal is closed.`
                : status.configured
                  ? "Get notified on this device — leave, approvals, tickets and announcements."
                  : "An administrator needs to configure push (VAPID keys) before this workspace can send notifications."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {enabled ? (
            <Button variant="secondary" size="sm" onClick={disable} disabled={busy}>
              Turn off
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={enable} disabled={busy || !status.configured}>
              {busy ? "Working…" : "Enable"}
            </Button>
          )}
        </div>
      </div>
      {message ? <p className="mt-2 text-xs text-secondary">{message}</p> : null}
    </section>
  );
}