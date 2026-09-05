"use client";

import { useEffect, useState } from "react";
import { Link2, Tag, Timer, Wand2 } from "lucide-react";

import { btn, input } from "./ui";

interface Tag {
  name: string;
}

interface TimeEntry {
  id: string;
  minutes: number;
  note: string | null;
  createdAt: string;
  userName: string;
}

interface TimeData {
  entries: TimeEntry[];
  totalMinutes: number;
}

interface TicketLink {
  id: string;
  relation: string;
  linkedTicketId: string;
  title: string;
  status: string;
}

interface Macro {
  id: string;
  name: string;
  description: string | null;
  actions: { op: string; value: string }[];
}

const RELATIONS = ["related", "blocks", "duplicates"] as const;

function fmtDur(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h ${minutes % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Small caps section header inside the ticket detail panel. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * Zammad-parity agent toolkit rendered inside the ticket detail panel for
 * `tickets.manage` holders: tags, time accounting, linked tickets and macros.
 */
export function TicketToolkit({
  ticketId,
  onMacroApplied,
}: {
  ticketId: string;
  onMacroApplied: () => Promise<void>;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [time, setTime] = useState<TimeData>({ entries: [], totalMinutes: 0 });
  const [minutes, setMinutes] = useState("");
  const [timeNote, setTimeNote] = useState("");
  const [links, setLinks] = useState<TicketLink[]>([]);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<
    { id: string; title: string; status: string; createdAt: string }[]
  >([]);
  const [linkRelation, setLinkRelation] = useState<string>("related");
  const [macros, setMacros] = useState<Macro[]>([]);
  const [macroBusy, setMacroBusy] = useState(false);
  const [toolkitError, setToolkitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch(`/api/v1/tickets/${ticketId}/tags`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/v1/tickets/${ticketId}/time`).then((r) =>
        r.ok ? r.json() : { entries: [], totalMinutes: 0 },
      ),
      fetch(`/api/v1/tickets/${ticketId}/links`).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/v1/tickets/macros").then((r) => (r.ok ? r.json() : [])),
    ]).then(([t, tm, lk, mc]) => {
      setTags(t);
      setTime(tm);
      setLinks(lk);
      setMacros(mc);
    });
  }, [ticketId]);

  async function doFetch(fn: () => Promise<void>) {
    setBusy(true);
    setToolkitError(null);
    try {
      await fn();
    } catch {
      setToolkitError("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function addTag() {
    const name = tagInput.trim();
    if (!name) return;
    await doFetch(async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      setTags(await res.json());
      setTagInput("");
    });
  }

  async function deleteTag(name: string) {
    await doFetch(async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/tags?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setTags(await res.json());
    });
  }

  async function logTime() {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m < 1) return;
    await doFetch(async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: m, note: timeNote || null }),
      });
      if (!res.ok) throw new Error();
      setTime(await res.json());
      setMinutes("");
      setTimeNote("");
    });
  }

  async function searchLinks(q: string) {
    setLinkQuery(q);
    if (q.trim().length < 2) {
      setLinkResults([]);
      return;
    }
    const res = await fetch(
      `/api/v1/tickets/${ticketId}/links/search?q=${encodeURIComponent(q)}`,
    );
    if (res.ok) setLinkResults(await res.json());
  }

  async function addLink(targetId: string) {
    await doFetch(async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedTicketId: targetId, relation: linkRelation }),
      });
      if (!res.ok) throw new Error();
      setLinks(await res.json());
      setLinkQuery("");
      setLinkResults([]);
    });
  }

  async function unlink(targetId: string) {
    await doFetch(async () => {
      const res = await fetch(
        `/api/v1/tickets/${ticketId}/links?linked_ticket_id=${targetId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      setLinks(await res.json());
    });
  }

  async function applyMacro(macroId: string) {
    setMacroBusy(true);
    setToolkitError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/macros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macroId }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setToolkitError(d.error?.message ?? "Macro failed");
        return;
      }
      await onMacroApplied();
    } finally {
      setMacroBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-border-subtle pt-3">
      {toolkitError ? (
        <p role="alert" className="mb-2 rounded-md border border-danger/30 bg-danger-subtle px-2 py-1.5 text-xs text-danger">
          {toolkitError}
        </p>
      ) : null}

      {/* Tags */}
      <Section title="Tags">
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.length === 0 ? (
            <span className="text-xs text-tertiary">No tags yet.</span>
          ) : (
            tags.map((t) => (
              <span
                key={t.name}
                className="inline-flex items-center gap-1 rounded-full border border-border-default bg-surface px-2 py-0.5 text-xs font-medium text-primary"
              >
                <Tag className="h-3 w-3 text-tertiary" strokeWidth={1.75} />
                {t.name}
                <button
                  type="button"
                  aria-label={`Remove tag ${t.name}`}
                  disabled={busy}
                  onClick={() => void deleteTag(t.name)}
                  className="text-tertiary hover:text-danger"
                >
                  ×
                </button>
              </span>
            ))
          )}
          <span className="inline-flex items-center gap-1">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addTag();
                }
              }}
              placeholder="Add tag…"
              className={`${input} h-7 w-28 text-xs`}
            />
            <button type="button" onClick={() => void addTag()} disabled={busy} className={`${btn.secondary} ${btn.small}`}>
              Add
            </button>
          </span>
        </div>
      </Section>

      {/* Time accounting */}
      <Section title={`Time · ${fmtDur(time.totalMinutes)}`}>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Timer className="h-3.5 w-3.5 text-tertiary" strokeWidth={1.75} />
          <input
            type="number"
            min="1"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="mins"
            className={`${input} h-7 w-16 text-xs`}
          />
          <input
            value={timeNote}
            onChange={(e) => setTimeNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void logTime();
              }
            }}
            placeholder="Note (optional)"
            className={`${input} h-7 w-40 text-xs`}
          />
          <button type="button" onClick={() => void logTime()} disabled={busy} className={`${btn.secondary} ${btn.small}`}>
            Log
          </button>
        </span>
        {time.entries.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {time.entries.slice(0, 5).map((en) => (
              <li key={en.id} className="text-xs text-secondary">
                <span className="font-medium text-primary">{fmtDur(en.minutes)}</span> · {en.userName}
                {en.note ? ` — ${en.note}` : ""} ·{" "}
                <span className="text-tertiary">{new Date(en.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Linked tickets */}
      <Section title="Linked tickets">
        {links.length > 0 && (
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Link2 className="h-3 w-3 shrink-0 text-tertiary" strokeWidth={1.75} />
                  <a href={`/tickets/${l.linkedTicketId}`} className="truncate font-medium text-brand hover:underline">
                    {l.title}
                  </a>
                  <span className="shrink-0 rounded-full border border-border-default px-1.5 py-px text-[10px] text-tertiary">
                    {l.relation}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void unlink(l.linkedTicketId)}
                  disabled={busy}
                  className="shrink-0 text-tertiary hover:text-danger"
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <select
            value={linkRelation}
            onChange={(e) => setLinkRelation(e.target.value)}
            className={`${input} h-7 w-28 text-xs`}
          >
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            value={linkQuery}
            onChange={(e) => void searchLinks(e.target.value)}
            placeholder="Search ticket titles…"
            className={`${input} h-7 w-44 text-xs`}
          />
        </div>
        {linkResults.length > 0 && (
          <ul className="mt-1 rounded-md border border-border-default bg-surface">
            {linkResults.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => void addLink(r.id)}
                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-surface-hover"
                >
                  <span className="truncate font-medium text-primary">{r.title}</span>
                  <span className="shrink-0 text-tertiary">{r.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Macros */}
      {macros.length > 0 && (
        <Section title="Macros">
          <div className="flex flex-wrap gap-1.5">
            {macros.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={macroBusy}
                title={m.description ?? undefined}
                onClick={() => void applyMacro(m.id)}
                className={`${btn.secondary} ${btn.small}`}
              >
                <Wand2 className="mr-1 inline h-3 w-3" strokeWidth={1.75} />
                {m.name}
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}