"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export async function apiCall(method: string, path: string, body?: unknown): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
}

export function ActionButton({
  label,
  method = "PATCH",
  path,
  body,
  confirm,
  className,
}: {
  label: string;
  method?: string;
  path: string;
  body?: unknown;
  confirm?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={className}
      onClick={async () => {
        if (confirm && !window.confirm(confirm)) return;
        setBusy(true);
        const { ok, data } = await apiCall(method, path, body);
        setBusy(false);
        if (!ok) {
          const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? "Request failed";
          window.alert(msg);
          return;
        }
        router.refresh();
      }}
    >
      {busy ? "…" : label}
    </button>
  );
}

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "numberCents" | "date" | "textarea" | "select" | "bool";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  /**
   * If set, the field's value lands inside this nested object in the
   * final body instead of at the top level. e.g. `nest: "payload"`
   * produces `{ payload: { summary: "..." } }`. The top-level `name`
   * is still used for the form input id.
   */
  nest?: string;
};

/**
 * Coerce a single form value into the right shape for the API body.
 * Field type drives the conversion — no caller-supplied functions cross
 * the RSC boundary.
 */
function coerceField(f: FieldDef, raw: string): unknown {
  if (!raw) return undefined;
  switch (f.type) {
    case "number":
      return Number(raw);
    case "numberCents":
      return Math.round(Number(raw) * 100);
    case "bool":
      return raw === "on" || raw === "true";
    default:
      return raw;
  }
}

/** Compact structured form posting JSON to an API route. */
export function SimpleForm({
  fields,
  path,
  method = "POST",
  submitLabel,
  payload,
}: {
  fields: FieldDef[];
  path: string;
  method?: string;
  submitLabel: string;
  /**
   * Optional server-computed payload template. Field values that
   * aren't already covered by `fields` can be added here as plain
   * data (e.g. `category: "other"` as a default, or a derived
   * `submit: true` flag). The form spreads this object before
   * adding the user-entered values.
   */
  payload?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 px-5 py-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const body: Record<string, unknown> = { ...(payload ?? {}) };
        for (const f of fields) {
          const raw = String(fd.get(f.name) ?? "").trim();
          if (!raw) continue;
          const v = coerceField(f, raw);
          if (v === undefined) continue;
          if (f.nest) {
            const nested = (body[f.nest] as Record<string, unknown> | undefined) ?? {};
            nested[f.name] = v;
            body[f.nest] = nested;
          } else {
            body[f.name] = v;
          }
        }
        // path supports `{fieldName}` interpolation from the form
        // values, so callers can use it for dynamic paths like
        // `/api/v1/reviews/{entryId}`.
        const interpolatedPath = path.replace(/\{(\w+)\}/g, (_, k: string) => {
          const v = body[k];
          return v === undefined || v === null ? "" : String(v);
        });
        setBusy(true);
        const { ok, data } = await apiCall(method, interpolatedPath, body);
        setBusy(false);
        if (!ok) {
          const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? "Submit failed";
          window.alert(msg);
          return;
        }
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }}
    >
      {fields.map((f) => (
        <label key={f.name} className="text-xs font-medium">
          {f.label}
          {f.type === "textarea" ? (
            <textarea name={f.name} required={f.required} placeholder={f.placeholder} rows={2}
              className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm" />
          ) : f.type === "select" ? (
            <select name={f.name} required={f.required} defaultValue=""
              className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm">
              <option value="" disabled>Select…</option>
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input name={f.name} type={f.type ?? "text"} required={f.required} placeholder={f.placeholder}
              className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm" />
          )}
        </label>
      ))}
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50">
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
