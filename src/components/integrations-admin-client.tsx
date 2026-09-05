"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, CardHeader, EmptyState } from "@/components/ui";

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastDeliveredAt: string | null;
}

interface SsoConfig {
  id: string;
  name: string;
  provider: string;
  issuer: string;
  clientId: string | null;
  clientSecret: string | null;
  discoveryUrl: string | null;
  metadataUrl: string | null;
  enabled: boolean;
  jitProvision: boolean;
  defaultRoleKey: string;
}

interface Props {
  webhooks: WebhookRow[];
  sso: SsoConfig | null;
  scimUrl: string;
}

const EVENT_OPTIONS = ["user.created", "user.updated", "user.deactivated", "ticket.created", "ticket.updated", "ticket.resolved"];

const inputCls =
  "w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-accent focus:outline-none";

export function IntegrationsAdminClient({ webhooks: initial, sso: initialSso, scimUrl }: Props) {
  const [webhooks, setWebhooks] = useState(initial);
  const [sso, setSso] = useState(initialSso);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Webhook form
  const [whName, setWhName] = useState("");
  const [whUrl, setWhUrl] = useState("");
  const [whEvents, setWhEvents] = useState<string[]>([]);

  // SSO form
  const [ssoName, setSsoName] = useState(initialSso?.name ?? "");
  const [ssoIssuer, setSsoIssuer] = useState(initialSso?.issuer ?? "");
  const [ssoClientId, setSsoClientId] = useState(initialSso?.clientId ?? "");
  const [ssoClientSecret, setSsoClientSecret] = useState("");
  const [ssoDiscovery, setSsoDiscovery] = useState(initialSso?.discoveryUrl ?? "");
  const [ssoJit, setSsoJit] = useState(initialSso?.jitProvision ?? true);

  // SCIM
  const [scimEnabled, setScimEnabled] = useState(false);
  const [scimToken, setScimToken] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/scim")
      .then((r) => r.json())
      .then((d) => {
        setScimEnabled(d.enabled ?? false);
        setScimToken(d.token ?? null);
      })
      .catch(() => {});
  }, []);

  const flash = (err: string | null, okMsg: string | null) => {
    setError(err);
    setOk(okMsg);
  };

  const refreshWebhooks = useCallback(async () => {
    const r = await fetch("/api/v1/webhooks");
    if (r.ok) setWebhooks((await r.json()).webhooks ?? []);
  }, []);

  const createWebhook = async () => {
    setBusy(true);
    flash(null, null);
    try {
      const r = await fetch("/api/v1/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: whName, url: whUrl, events: whEvents.length ? whEvents : undefined }),
      });
      if (!r.ok) throw new Error(((await r.json()).error?.message) ?? "Could not create webhook");
      setWhName("");
      setWhUrl("");
      setWhEvents([]);
      await refreshWebhooks();
      flash(null, "Webhook created");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not create webhook", null);
    } finally {
      setBusy(false);
    }
  };

  const deleteWebhook = async (id: string) => {
    if (!window.confirm("Delete this webhook? Endpoints will stop receiving events.")) return;
    const r = await fetch(`/api/v1/webhooks/${id}`, { method: "DELETE" });
    if (r.ok) {
      await refreshWebhooks();
      flash(null, "Webhook deleted");
    } else {
      flash("Could not delete webhook", null);
    }
  };

  const toggleWebhook = async (id: string, active: boolean) => {
    await fetch(`/api/v1/webhooks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active }),
    });
    await refreshWebhooks();
  };

  const testWebhook = async (id: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/webhooks/${id}/test`, { method: "POST" });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; status?: number } | null;
      if (r.ok && d?.ok) {
        flash(null, `Test delivered — endpoint replied ${d.status ?? "200"}`);
      } else {
        flash("Test failed — check the endpoint URL and retry", null);
      }
      await refreshWebhooks();
    } finally {
      setBusy(false);
    }
  };

  const saveSso = async () => {
    setBusy(true);
    flash(null, null);
    try {
      const r = await fetch("/api/v1/admin/sso", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: ssoName,
          issuer: ssoIssuer,
          clientId: ssoClientId || null,
          clientSecret: ssoClientSecret || null,
          discoveryUrl: ssoDiscovery || null,
          jitProvision: ssoJit,
        }),
      });
      if (!r.ok) throw new Error(((await r.json()).error?.message) ?? "Could not save SSO configuration");
      const d = (await r.json()) as { config: SsoConfig };
      setSso(d.config);
      setSsoClientSecret("");
      flash(null, "SSO configuration saved");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not save SSO", null);
    } finally {
      setBusy(false);
    }
  };

  const toggleSso = async () => {
    const target = !sso?.enabled;
    const r = await fetch("/api/v1/admin/sso/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: target }),
    });
    if (r.ok) {
      setSso((s) => (s ? { ...s, enabled: target } : s));
      flash(null, target ? "SSO enabled — employees can now sign in with the identity provider" : "SSO disabled");
    } else {
      flash("Could not change SSO state", null);
    }
  };

  const generateScim = async () => {
    setBusy(true);
    flash(null, null);
    try {
      const r = await fetch("/api/v1/admin/scim", { method: "POST" });
      if (!r.ok) throw new Error("Could not generate a provisioning token");
      const d = (await r.json()) as { token: string };
      setScimToken(d.token);
      setScimEnabled(true);
      flash(null, "Token generated — copy it now, it is shown only once");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not generate token", null);
    } finally {
      setBusy(false);
    }
  };

  const disableScim = async () => {
    const r = await fetch("/api/v1/admin/scim", { method: "DELETE" });
    if (r.ok) {
      setScimEnabled(false);
      setScimToken(null);
      flash(null, "SCIM provisioning disabled");
    } else {
      flash("Could not disable SCIM", null);
    }
  };

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</div>}
      {ok && <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success">{ok}</div>}

      {/* ---------------- Webhooks ---------------- */}
      <section className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
        <CardHeader title="Webhooks" subtitle="Signed, org-scoped events pushed to your systems (HMAC-SHA256)." />
        <div className="space-y-3 p-4 sm:p-5">
          {webhooks.length === 0 ? (
            <EmptyState title="No webhooks yet" hint="Deliver user and ticket events to your own systems." />
          ) : (
            <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
              {webhooks.map((w) => (
                <li key={w.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${w.active ? "bg-success" : "bg-tertiary/50"}`} aria-hidden />
                      <span className="text-sm font-medium text-primary">{w.name}</span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-tertiary">{w.url}</p>
                    {w.lastError && <p className="mt-0.5 text-xs text-danger">Last delivery failed: {w.lastError}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleWebhook(w.id, !w.active)}
                      className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-tertiary hover:text-primary"
                    >
                      {w.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      onClick={() => testWebhook(w.id)}
                      className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-tertiary hover:text-primary"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteWebhook(w.id)}
                      className="rounded-md border border-danger/30 px-2.5 py-1 text-xs text-danger hover:bg-danger/10"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
            <input value={whName} onChange={(e) => setWhName(e.target.value)} placeholder="Webhook name" className={inputCls} />
            <input value={whUrl} onChange={(e) => setWhUrl(e.target.value)} placeholder="https://your-system.example/hook" className={inputCls} />
            <div className="sm:col-span-2">
              <div className="flex flex-wrap gap-1.5">
                {EVENT_OPTIONS.map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => setWhEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]))}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      whEvents.includes(ev)
                        ? "border-brand bg-brand-subtle text-brand-text"
                        : "border-border-subtle text-tertiary hover:text-primary"
                    }`}
                  >
                    {ev}
                  </button>
                ))}
                <span className="self-center text-xs text-tertiary">(empty = all events)</span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Button onClick={createWebhook} disabled={busy || !whName || !whUrl}>
                Create webhook
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- SSO ---------------- */}
      <section className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
        <CardHeader
          title="Single sign-on (OIDC)"
          subtitle="Sign employees in through your identity provider. No passwords on this path."
        />
        <div className="space-y-3 p-4 sm:p-5">
          {!sso && (
            <p className="text-sm text-tertiary">
              Not configured. Point your identity provider at the callback URL{" "}
              <code className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-xs">{`${scimUrl.replace("/api/v1/scim/v2", "")}/api/v1/auth/sso/callback`}</code>
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={ssoName} onChange={(e) => setSsoName(e.target.value)} placeholder="Configuration name (e.g. Okta)" className={inputCls} />
            <input value={ssoIssuer} onChange={(e) => setSsoIssuer(e.target.value)} placeholder="Issuer (e.g. https://your-org.okta.com)" className={inputCls} />
            <input value={ssoClientId} onChange={(e) => setSsoClientId(e.target.value)} placeholder="Client ID" className={inputCls} />
            <input
              value={ssoClientSecret}
              onChange={(e) => setSsoClientSecret(e.target.value)}
              placeholder={sso?.clientSecret ? "New client secret (leave blank to keep)" : "Client secret"}
              type="password"
              className={inputCls}
            />
            <input
              value={ssoDiscovery}
              onChange={(e) => setSsoDiscovery(e.target.value)}
              placeholder="Discovery URL (defaults to issuer/.well-known/openid-configuration)"
              className={`${inputCls} sm:col-span-2`}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-primary">
            <input type="checkbox" checked={ssoJit} onChange={(e) => setSsoJit(e.target.checked)} className="h-4 w-4 rounded border-border-subtle" />
            Auto-provision new users on first sign-in (JIT, default role: employee)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveSso} disabled={busy || !ssoIssuer}>
              Save configuration
            </Button>
            {sso && (
              <Button variant={sso.enabled ? "secondary" : "primary"} onClick={toggleSso}>
                {sso.enabled ? "Disable SSO" : "Enable SSO"}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- SCIM ---------------- */}
      <section className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
        <CardHeader title="SCIM provisioning" subtitle="Let your identity provider create, update, deactivate and group employees." />
        <div className="space-y-3 p-4 sm:p-5">
          <div className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-tertiary">Endpoint</p>
            <code className="mt-1 block break-all font-mono text-xs text-primary">{scimUrl}</code>
          </div>
          {scimToken ? (
            <div className="rounded-lg border border-brand/30 bg-brand-subtle p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-text">Provisioning token (shown once)</p>
              <code className="mt-1 block break-all font-mono text-xs text-primary">{scimToken}</code>
              <p className="mt-2 text-xs text-tertiary">
                Store it in your identity provider's SCIM connector. Bearer authentication, hashed at rest.
              </p>
            </div>
          ) : (
            <p className="text-sm text-tertiary">{scimEnabled ? "A token is set but not displayed again — regenerate for a new one." : "No provisioning token yet."}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={generateScim} disabled={busy}>
              {scimToken ? "Regenerate token" : scimEnabled ? "Regenerate token" : "Generate token & enable"}
            </Button>
            {scimEnabled && (
              <Button variant="secondary" onClick={disableScim}>
                Disable provisioning
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}