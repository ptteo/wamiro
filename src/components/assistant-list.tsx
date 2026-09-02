"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  Database,
  History,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import { cx } from "@/lib/cx";

// ── Types ───────────────────────────────────────────────────────
export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  messageCount: number;
}

export type ModeValue =
  | "prefetched_only"
  | "tools"
  | "no_tools"
  | "auto_no_tools"
  | "auto_tools";

export interface AssistantMessage {
  id: string | number; // string for streamed, number for persisted
  role: "user" | "assistant";
  content: string;
  /** Streaming reasoning / chain-of-thought, if the model emits it. */
  reasoning?: string;
  /** While streaming, the assistant message may still be growing. */
  streaming?: boolean;
  /** Tool calls that produced this message. */
  toolCalls?: { name: string; ok: boolean; durationMs: number; blocked?: boolean }[];
  /** Citations the assistant returned with this message. */
  citations?: { id: string; title: string }[];
  mode?: ModeValue;
  /** When the message was created (ISO). */
  createdAt?: string;
}

export interface AssistantContext {
  configured: boolean;
  conversationId?: string;
  initialMessages: AssistantMessage[];
  suggestions: string[];
  conversations: ConversationSummary[];
}

// ── Helpers ─────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}

function dayBucket(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This week";
  if (diff < 30) return "Earlier this month";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Lightweight markdown renderer for the chat. Handles the things that
 * actually come out of the model today: **bold**, *italic*, `code`,
 * [link](url), bulleted/ordered lists, headings, fenced code blocks,
 * tables. Anything more elaborate falls back to plain text.
 *
 * Streaming-safe: handles incomplete tokens gracefully (no broken HTML).
 */
function extractFollowUps(text: string): { body: string; followUps: string[] } {
  const match = text.match(/\n###\s*(Next|Follow-?ups?)\s*\n([\s\S]*)$/i);
  if (!match) return { body: text, followUps: [] };
  const body = text.slice(0, match.index).trimEnd();
  const followUps = (match[2] ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-*\d.]+\s*/, "").trim())
    .filter((l) => l.length > 0 && l.length < 140)
    .slice(0, 3);
  return { body, followUps };
}

function renderMarkdown(text: string) {
  if (!text) return null;
  // Split on fenced code blocks first.
  const parts: Array<{ type: "code" | "text"; content: string; lang?: string }> = [];
  const codeRe = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(text))) {
    if (m.index > last) parts.push({ type: "text", content: text.slice(last, m.index) });
    parts.push({ type: "code", content: m[2] ?? "", lang: m[1] || undefined });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", content: text.slice(last) });

  return parts.map((p, i) => {
    if (p.type === "code") {
      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-md bg-surface p-3 text-[11px] leading-relaxed text-primary"
        >
          <code className={p.lang ? `language-${p.lang}` : undefined}>{p.content}</code>
        </pre>
      );
    }
    return renderInline(p.content, i);
  });
}

function renderInline(text: string, key: number | string) {
  // Process line by line so headings, lists, and tables are honored.
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableKey = 0;
  let buf: React.ReactNode[] = [];

  const flushBuf = () => {
    if (buf.length) {
      out.push(
        <p key={`p-${out.length}`} className="my-1 leading-relaxed">
          {buf}
        </p>,
      );
      buf = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.includes("|") && line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        inTable = true;
        continue;
      }
      if (!inTable) {
        if (buf.length) flushBuf();
        inTable = true;
      }
      tableRows.push(cells);
      continue;
    }
    if (inTable) {
      if (buf.length) flushBuf();
      out.push(
        <table
          key={`tbl-${tableKey++}`}
          className="my-2 w-full border-collapse text-[11px]"
        >
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={ri} className="border-b border-border-subtle last:border-0">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="border-r border-border-subtle px-2 py-1 last:border-r-0"
                  >
                    {renderInlineMd(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      tableRows = [];
      inTable = false;
    }

    if (line.startsWith("### ")) {
      flushBuf();
      out.push(
        <h3 key={i} className="mt-2 mb-1 text-sm font-semibold text-primary">
          {line.slice(4)}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushBuf();
      out.push(
        <h2 key={i} className="mt-3 mb-1 text-sm font-semibold text-primary">
          {line.slice(3)}
        </h2>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushBuf();
      out.push(
        <h1 key={i} className="mt-3 mb-1 text-base font-semibold text-primary">
          {line.slice(2)}
        </h1>,
      );
      continue;
    }
    if (/^[-*] /.test(line)) {
      flushBuf();
      out.push(
        <ul key={i} className="my-1 list-disc pl-5">
          <li className="leading-relaxed">{renderInlineMd(line.slice(2))}</li>
        </ul>,
      );
      continue;
    }
    if (/^\d+\. /.test(line)) {
      flushBuf();
      out.push(
        <ol key={i} className="my-1 list-decimal pl-5">
          <li className="leading-relaxed">{renderInlineMd(line.replace(/^\d+\. /, ""))}</li>
        </ol>,
      );
      continue;
    }
    if (line.trim() === "") {
      flushBuf();
      continue;
    }
    buf.push(renderInlineMd(line));
  }
  if (inTable) {
    flushBuf();
    out.push(
      <table key={`tbl-${tableKey++}`} className="my-2 w-full border-collapse text-[11px]">
        <tbody>
          {tableRows.map((row, ri) => (
            <tr key={ri} className="border-b border-border-subtle last:border-0">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border-r border-border-subtle px-2 py-1 last:border-r-0"
                >
                  {renderInlineMd(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>,
    );
  }
  flushBuf();
  return <span key={key}>{out}</span>;
}

function renderInlineMd(text: string): React.ReactNode {
  const tokens: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        tokens.push(
          <strong key={key++} className="font-semibold text-primary">
            {renderInlineMd(text.slice(i + 2, end))}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "*" && text[i + 1] !== "*") {
      const end = text.indexOf("*", i + 1);
      if (end > i + 1) {
        tokens.push(
          <em key={key++} className="italic text-primary">
            {renderInlineMd(text.slice(i + 1, end))}
          </em>,
        );
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "`" && text[i + 1] !== "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        tokens.push(
          <code
            key={key++}
            className="rounded bg-surface-subtle px-1 py-0.5 font-mono text-[11px] text-primary"
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "[") {
      const close = text.indexOf("]", i + 1);
      if (close > i + 1 && text[close + 1] === "(") {
        const urlEnd = text.indexOf(")", close + 2);
        if (urlEnd > close + 1) {
          const label = text.slice(i + 1, close);
          const target = text.slice(close + 2, urlEnd);
          if (target.startsWith("citation:")) {
            const id = target.slice("citation:".length);
            tokens.push(
              <Link
                key={key++}
                href={`/knowledge?id=${encodeURIComponent(id)}`}
                className="inline-flex items-center gap-1 rounded-full bg-brand-subtle px-2 py-0.5 text-[11px] font-medium text-brand-text transition hover:bg-brand/20"
              >
                <Database className="h-2.5 w-2.5" />
                {label}
              </Link>,
            );
          } else {
            tokens.push(
              <a
                key={key++}
                href={target}
                target="_blank"
                rel="noreferrer noopener"
                className="text-brand-text underline-offset-2 hover:underline"
              >
                {label}
              </a>,
            );
          }
          i = urlEnd + 1;
          continue;
        }
      }
    }
    let j = i;
    while (j < text.length) {
      const c = text[j];
      if (c === "*" || c === "`" || c === "[" || c === "\n") break;
      j++;
    }
    if (j > i) {
      tokens.push(text.slice(i, j));
      i = j;
    } else {
      tokens.push(text[i]);
      i++;
    }
  }
  return <>{tokens}</>;
}

// ── Component ───────────────────────────────────────────────────
export function AssistantListClient(ctx: AssistantContext) {
  const router = useRouter();
  const [messages, setMessages] = useState<AssistantMessage[]>(ctx.initialMessages);
  const [conversations, setConversations] = useState(ctx.conversations);
  const [activeId, setActiveId] = useState<string | undefined>(ctx.conversationId);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolRunning, setToolRunning] = useState<string | null>(null);
  const [stickyBottom, setStickyBottom] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<number | string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | number | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSentRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Reset messages when conversation changes
  useEffect(() => {
    setMessages(ctx.initialMessages);
    setActiveId(ctx.conversationId);
    setError(null);
    setToolRunning(null);
    setHistoryOpen(false);
  }, [ctx.conversationId, ctx.initialMessages]);

  useEffect(() => {
    if (!historyOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setHistoryOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [historyOpen]);
  useEffect(() => {
    if (stickyBottom) {
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }));
    }
  }, [messages, stickyBottom]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setStickyBottom(distance < 80);
  }

  function scrollToBottom() {
    listRef.current?.scrollTo({ top: 1e6, behavior: "smooth" });
    setStickyBottom(true);
  }

  // Auto-resize textarea
  useEffect(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
  }, [draft, busy]);

  // History filter
  const filteredConvs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter(
      (c) =>
        (c.title ?? "").toLowerCase().includes(needle) ||
        (c.lastMessagePreview ?? "").toLowerCase().includes(needle),
    );
  }, [conversations, search]);

  // Group by day
  const grouped = useMemo(() => {
    const m = new Map<string, ConversationSummary[]>();
    for (const c of filteredConvs) {
      const key = dayBucket(c.lastMessageAt ?? c.createdAt);
      const arr = m.get(key) ?? [];
      arr.push(c);
      m.set(key, arr);
    }
    return m;
  }, [filteredConvs]);

  const lastFollowUps = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant" && !m.streaming);
    if (!last) return [];
    return extractFollowUps(last.content).followUps;
  }, [messages]);

  /**
   * Send a message and stream the response. Reads NDJSON from the
   * streaming fetch and updates the placeholder message in place.
   */
  const send = useCallback(
    async (text: string, opts?: { history?: AssistantMessage[] }) => {
      const content = text.trim();
      if (!content || busy) return;
      setError(null);
      setToolRunning(null);
      setBusy(true);
      lastSentRef.current = content;

      const prior = opts?.history ?? messages;
      const last = prior[prior.length - 1];
      const userMsg: AssistantMessage = {
        id: `tmp-user-${Date.now()}`,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      const userHistory =
        last?.role === "user" && last.content === content ? prior : [...prior, userMsg];

      const streamingId = `tmp-assistant-${Date.now()}`;
      const placeholder: AssistantMessage = {
        id: streamingId,
        role: "assistant",
        content: "",
        streaming: true,
        toolCalls: [],
        reasoning: "",
        createdAt: new Date().toISOString(),
      };
      setMessages([...userHistory, placeholder]);
      setStickyBottom(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const payload = {
        conversationId: activeId,
        messages: userHistory.map((m) => ({ role: m.role, content: m.content })),
      };

      async function post(attempt: number): Promise<Response> {
        try {
          const res = await fetch("/api/v1/ai/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          if (res.ok) return res;
          const retryable = res.status === 429 || res.status >= 500;
          if (attempt === 0 && retryable) {
            const ra = Number(res.headers.get("retry-after"));
            const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 8_000) : 600;
            await new Promise((r) => setTimeout(r, wait));
            return post(1);
          }
          return res;
        } catch (e) {
          if (controller.signal.aborted) throw e;
          if (attempt === 0) return post(1);
          throw e;
        }
      }

      try {
        const res = await post(0);

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
          const message = data.error?.message ?? "The assistant is unavailable right now.";
          setError(message);
          setMessages((ms) => ms.filter((m) => m.id !== streamingId));
          return;
        }

        const newConvId = res.headers.get("X-Conversation-Id");
        if (newConvId && newConvId !== activeId) {
          setActiveId(newConvId);
          router.refresh();
          window.history.replaceState(null, "", `/assistant?c=${newConvId}`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setError("The assistant stream closed unexpectedly.");
          setMessages((ms) => ms.filter((m) => m.id !== streamingId));
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        const toolCalls: NonNullable<AssistantMessage["toolCalls"]> = [];
        const citations: NonNullable<AssistantMessage["citations"]> = [];

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n")) >= 0) {
            const rawLine = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            const line = rawLine.replace(/\r$/, "");
            if (!line) continue;
            try {
              const chunk = JSON.parse(line) as {
                type: string;
                content?: string;
                name?: string;
                ok?: boolean;
                durationMs?: number;
                blocked?: boolean;
                list?: { id: string; title: string }[];
                redaction?: { text?: string };
                code?: string;
                message?: string;
                value?: ModeValue;
                mode?: ModeValue;
              };
              if (chunk.type === "token") {
                setMessages((ms) =>
                  ms.map((m) =>
                    m.id === streamingId ? { ...m, content: m.content + (chunk.content ?? "") } : m,
                  ),
                );
              } else if (chunk.type === "reasoning") {
                setMessages((ms) =>
                  ms.map((m) =>
                    m.id === streamingId
                      ? { ...m, reasoning: (m.reasoning ?? "") + (chunk.content ?? "") }
                      : m,
                  ),
                );
              } else if (chunk.type === "tool_start") {
                setToolRunning(chunk.name ?? null);
              } else if (chunk.type === "tool_end") {
                setToolRunning(null);
                toolCalls.push({
                  name: chunk.name ?? "tool",
                  ok: !!chunk.ok,
                  durationMs: chunk.durationMs ?? 0,
                  blocked: chunk.blocked,
                });
                setMessages((ms) =>
                  ms.map((m) =>
                    m.id === streamingId ? { ...m, toolCalls: [...toolCalls] } : m,
                  ),
                );
              } else if (chunk.type === "citations") {
                for (const c of chunk.list ?? []) citations.push(c);
                setMessages((ms) =>
                  ms.map((m) => (m.id === streamingId ? { ...m, citations } : m)),
                );
              } else if (chunk.type === "error") {
                setError(chunk.message ?? "The assistant is unavailable right now.");
              } else if (chunk.type === "mode") {
                setMessages((ms) =>
                  ms.map((m) =>
                    m.id === streamingId ? { ...m, mode: chunk.value } : m,
                  ),
                );
              } else if (chunk.type === "done") {
                setMessages((ms) =>
                  ms.map((m) =>
                    m.id === streamingId
                      ? {
                          ...m,
                          streaming: false,
                          content: chunk.redaction?.text || m.content,
                          mode: chunk.mode ?? m.mode,
                        }
                      : m,
                  ),
                );
                router.refresh();
              }
            } catch {
              // ignore malformed lines
            }
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // user-initiated stop; keep what we have
        } else {
          setError("Network error — please try again.");
        }
      } finally {
        setBusy(false);
        setToolRunning(null);
        abortRef.current = null;
      }
    },
    [activeId, busy, messages, router],
  );

  function stop() {
    abortRef.current?.abort();
  }

  // ── Conversation CRUD ─────────────────────────────────────
  async function newConversation() {
    setActiveId(undefined);
    setMessages([]);
    setError(null);
    setHistoryOpen(false);
    textareaRef.current?.focus();
    window.history.pushState(null, "", "/assistant");
  }

  async function deleteConv(id: string) {
    const res = await fetch("/api/v1/ai/conversations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return;
    setConversations((cs) => cs.filter((c) => c.id !== id));
    if (activeId === id) {
      newConversation();
    }
  }

  function startRename(id: string, currentTitle: string | null) {
    setRenamingId(id);
    setRenameValue(currentTitle ?? "");
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  }

  async function commitRename() {
    if (!renamingId) return;
    const title = renameValue.trim();
    if (!title) {
      setRenamingId(null);
      return;
    }
    const res = await fetch(`/api/v1/ai/conversations/${renamingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      setConversations((cs) =>
        cs.map((c) => (c.id === renamingId ? { ...c, title } : c)),
      );
    }
    setRenamingId(null);
  }

  function exportConversation(format: "md" | "json") {
    if (!activeId) return;
    const title = conversations.find((c) => c.id === activeId)?.title ?? "conversation";
    if (format === "json") {
      const blob = new Blob(
        [JSON.stringify({ title, exportedAt: new Date().toISOString(), messages }, null, 2)],
        { type: "application/json" },
      );
      downloadBlob(blob, `${slug(title)}.json`);
      return;
    }
    const md = messages
      .map((m) => `**${m.role === "user" ? "You" : "Assistant"}**\n\n${m.content}\n`)
      .join("\n---\n\n");
    downloadBlob(new Blob([md], { type: "text/markdown" }), `${slug(title)}.md`);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function slug(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "conversation";
  }

  // ── Message actions ──────────────────────────────────────
  async function copyMessage(m: AssistantMessage) {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  }

  function startEdit(m: AssistantMessage) {
    setEditingMessageId(m.id);
    setEditingText(m.content);
  }

  async function commitEdit(m: AssistantMessage) {
    const text = editingText.trim();
    if (!text) {
      setEditingMessageId(null);
      return;
    }
    const id = String(m.id);
    const idx = messages.findIndex((x) => x.id === m.id);
    if (idx < 0) return;
    setMessages((ms) => ms.slice(0, idx));
    setEditingMessageId(null);
    if (/^\d+$/.test(id) && activeId) {
      await fetch("/api/v1/ai/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: activeId, messageId: id }),
      });
    }
    const prior = messages.slice(0, idx);
    void send(text, { history: prior });
  }

  function startRegenerate(m: AssistantMessage) {
    const idx = messages.findIndex((x) => x.id === m.id);
    if (idx < 0) return;
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx]?.role !== "user") userIdx--;
    if (userIdx < 0) return;
    const userMsg = messages[userIdx];
    if (!userMsg) return;
    const next = messages.slice(0, idx);
    setMessages(next);
    const id = String(m.id);
    if (/^\d+$/.test(id) && activeId) {
      void fetch("/api/v1/ai/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: activeId, messageId: id }),
      });
    }
    void send(userMsg.content, { history: next });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const value = draft;
      if (busy || !value.trim()) return;
      setDraft("");
      void send(value);
    }
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overscroll-none bg-surface lg:grid lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]">
      {historyOpen ? (
        <button
          type="button"
          className="absolute inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Close history"
          onClick={() => setHistoryOpen(false)}
        />
      ) : null}

      <aside
        className={cx(
          "z-40 flex min-h-0 flex-col border-border-subtle bg-surface",
          "max-lg:absolute inset-y-0 left-0 w-[min(20rem,88vw)] border-r shadow-xl transition-transform",
          historyOpen ? "max-lg:translate-x-0 max-lg:pointer-events-auto" : "max-lg:-translate-x-full max-lg:pointer-events-none",
          "lg:relative lg:min-h-0 lg:w-auto lg:translate-x-0 lg:border-r lg:shadow-none lg:pointer-events-auto",
        )}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">History</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setHistoryOpen(false);
                void newConversation();
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded-md bg-brand px-2.5 text-[11px] font-medium text-on-brand"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-tertiary lg:hidden"
              aria-label="Close history"
              onClick={() => setHistoryOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="border-b border-border-subtle px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search history…"
              aria-label="Search history"
              className="h-9 w-full rounded-md border border-border-subtle bg-surface-subtle/40 py-1 pl-8 pr-2 text-sm text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredConvs.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <MessageSquare className="mx-auto h-5 w-5 text-tertiary" />
              <p className="mt-2 text-xs font-medium text-primary">
                {conversations.length === 0 ? "No conversations yet" : "No matches"}
              </p>
            </div>
          ) : (
            [...grouped.entries()].map(([bucket, list]) => (
              <div key={bucket}>
                <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                  {bucket}
                </p>
                <ul className="pb-1">
                  {list.map((c) => {
                    const isActive = activeId === c.id;
                    const isRenaming = renamingId === c.id;
                    return (
                      <li key={c.id}>
                        {isRenaming ? (
                          <div className="px-3 py-1.5">
                            <input
                              ref={renameInputRef}
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void commitRename();
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              onBlur={() => void commitRename()}
                              className="h-9 w-full rounded-md border border-brand bg-surface px-2 text-sm text-primary focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div
                            className={cx(
                              "flex items-start gap-1 px-2 py-1.5",
                              isActive ? "bg-brand-subtle/40" : "hover:bg-surface-hover",
                            )}
                          >
                            <Link
                              href={`/assistant?c=${c.id}`}
                              onClick={() => setHistoryOpen(false)}
                              className="min-w-0 flex-1 py-0.5"
                            >
                              <p
                                className={cx(
                                  "line-clamp-1 text-sm",
                                  isActive ? "font-semibold text-brand-text" : "font-medium text-primary",
                                )}
                              >
                                {c.title || (c.lastMessagePreview ?? "New conversation").slice(0, 60)}
                              </p>
                              <p className="mt-0.5 text-[11px] tabular-nums text-tertiary">
                                {timeAgo(c.lastMessageAt ?? c.createdAt)} · {c.messageCount}
                              </p>
                            </Link>
                            <button
                              type="button"
                              onClick={() => void startRename(c.id, c.title)}
                              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-tertiary hover:bg-surface-hover hover:text-primary"
                              aria-label={`Rename ${c.title ?? "conversation"}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteConv(c.id)}
                              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-tertiary hover:bg-danger-subtle hover:text-danger"
                              aria-label={`Delete ${c.title ?? "conversation"}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-2 py-2 sm:px-3">
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-secondary hover:bg-surface-hover lg:hidden"
            aria-label="Open history"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen(true)}
          >
            <History className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            {activeId && renamingId === activeId ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename();
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onBlur={() => void commitRename()}
                className="h-9 w-full rounded-md border border-brand bg-surface px-2 text-sm text-primary"
              />
            ) : (
              <button
                type="button"
                className="block w-full truncate text-left text-sm font-semibold text-primary"
                onClick={() =>
                  activeId
                    ? startRename(activeId, conversations.find((c) => c.id === activeId)?.title ?? null)
                    : undefined
                }
              >
                {conversations.find((c) => c.id === activeId)?.title || "Assistant"}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={newConversation}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-secondary hover:bg-surface-hover"
            aria-label="New conversation"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </button>
          {activeId && messages.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportOpen((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-secondary hover:bg-surface-hover"
                aria-label="Export conversation"
                aria-expanded={exportOpen}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {exportOpen ? (
                <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-border-default bg-surface py-1 shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-hover"
                    onClick={() => {
                      exportConversation("md");
                      setExportOpen(false);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Markdown
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-hover"
                    onClick={() => {
                      exportConversation("json");
                      setExportOpen(false);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    JSON
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="relative flex-1 overflow-hidden">
          <div
            ref={listRef}
            onScroll={onScroll}
            role="log"
            aria-live="polite"
            className="h-full space-y-3 overflow-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4"
          >
            {messages.length === 0 && !busy ? (
              <WelcomeState
                configured={ctx.configured}
                suggestions={ctx.suggestions}
                onSelect={(s) => void send(s)}
              />
            ) : null}
            {messages.map((m) => (
              <MessageBubble
                key={String(m.id)}
                m={m}
                copied={copiedId === m.id}
                editing={editingMessageId === m.id}
                editingText={editingText}
                onCopy={() => copyMessage(m)}
                onEdit={() => startEdit(m)}
                onCommitEdit={() => commitEdit(m)}
                onCancelEdit={() => setEditingMessageId(null)}
                onRegenerate={() => startRegenerate(m)}
                onEditingTextChange={setEditingText}
              />
            ))}
            {busy && toolRunning ? <ToolRunningPill name={toolRunning} /> : null}
            {!busy && lastFollowUps.length > 0 ? (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {lastFollowUps.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                className="shrink-0 rounded-full border border-border-subtle bg-surface px-3 py-2.5 text-[13px] text-primary sm:py-2 sm:text-[12px]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {!stickyBottom && messages.length > 0 ? (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-2 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-1 rounded-full border border-border-default bg-surface px-3 py-1.5 text-[11px] font-medium text-secondary shadow-sm hover:bg-surface-hover"
              aria-label="Scroll to latest"
            >
              <ArrowDown className="h-3 w-3" />
              Latest
            </button>
          ) : null}
        </div>

        {error ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 border-t border-danger/30 bg-danger-subtle/40 px-4 py-2 text-xs text-danger"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{error}</span>
            {lastSentRef.current ? (
                <button
                  type="button"
                  onClick={() => lastSentRef.current && void send(lastSentRef.current)}
                  className="rounded-md border border-danger/30 bg-surface px-2 py-0.5 text-[10px] font-medium text-danger transition hover:bg-danger-subtle"
                >
                  Retry
                </button>
            ) : null}
          </div>
        ) : null}

        <form
          className="flex items-end gap-2 border-t border-border-subtle bg-surface px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3 sm:py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const value = draft;
            if (busy || !value.trim()) return;
            setDraft("");
            void send(value);
          }}
        >
          <textarea
            ref={textareaRef}
            name="message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              ctx.configured
                ? "Ask anything…"
                : "Assistant not configured on this deployment"
            }
            aria-label="Message the assistant"
            disabled={!ctx.configured}
            rows={1}
            maxLength={4000}
            onKeyDown={onKeyDown}
            className="min-h-10 max-h-40 w-full resize-none rounded-xl border border-border-default bg-surface px-3 py-2.5 text-base text-primary placeholder:text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50 sm:text-sm"
            autoComplete="off"
            enterKeyHint="send"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-danger px-3 text-sm font-medium text-on-brand"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!ctx.configured || !draft.trim()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-on-brand hover:bg-brand-hover disabled:opacity-40 sm:w-auto sm:px-3"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          )}
        </form>
      </section>
    </div>
  );
}

function WelcomeState({
  configured,
  suggestions,
  onSelect,
}: {
  configured: boolean;
  suggestions: string[];
  onSelect: (s: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-subtle text-brand-text">
        <Sparkles className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-primary">
        {configured ? "How can I help?" : "Assistant unavailable"}
      </h3>
      <p className="mt-1 max-w-md text-xs text-tertiary">
        {configured
          ? "Ask about your leave, approvals, announcements, the knowledge base, or anything about how the company works."
          : "The assistant is not configured on this deployment. Ask an administrator to configure the AI provider."}
      </p>
      {configured && suggestions.length > 0 ? (
        <div className="mt-4 flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSelect(s)}
              className="inline-flex min-h-10 items-center justify-center gap-1 rounded-full border border-border-subtle bg-surface px-3 py-2 text-left text-[13px] font-medium text-primary sm:min-h-0 sm:py-1.5 sm:text-[11px]"
            >
              <ArrowUp className="h-3 w-3 shrink-0 rotate-45" />
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ToolRunningPill({ name }: { name: string }) {
  return (
    <div className="flex justify-start">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3 py-1 text-[11px] text-tertiary">
        <Loader2 className="h-3 w-3 animate-spin text-brand-text" />
        Calling <span className="font-mono text-primary">{name}</span>
      </div>
    </div>
  );
}

function modeCaption(mode?: ModeValue): { label: string; tools: boolean } | null {
  if (!mode) return null;
  if (mode === "tools" || mode === "auto_tools" || mode === "prefetched_only") {
    return { label: "Looked up company data", tools: true };
  }
  return { label: "General answer", tools: false };
}

function MessageBubble({
  m,
  copied,
  editing,
  editingText,
  onCopy,
  onEdit,
  onCommitEdit,
  onCancelEdit,
  onRegenerate,
  onEditingTextChange,
}: {
  m: AssistantMessage;
  copied: boolean;
  editing: boolean;
  editingText: string;
  onCopy: () => void;
  onEdit: () => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onRegenerate: () => void;
  onEditingTextChange: (v: string) => void;
}) {
  const isUser = m.role === "user";
  const caption = modeCaption(m.mode);
  return (
    <div className={cx("group/msg flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[92%] rounded-2xl px-3 py-2.5 text-[15px] sm:max-w-[80%] sm:px-3.5 sm:text-sm",
          isUser
            ? "rounded-tr-sm bg-brand text-on-brand"
            : "rounded-tl-sm bg-surface-subtle text-primary",
        )}
      >
        {!isUser && m.toolCalls && m.toolCalls.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {m.toolCalls.map((t, i) => (
              <span
                key={i}
                className={cx(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  t.blocked
                    ? "border-danger/30 bg-danger-subtle text-danger"
                    : t.ok
                      ? "border-success/30 bg-success-subtle text-success"
                      : "border-border-subtle bg-surface text-tertiary",
                )}
              >
                <Database className="h-2.5 w-2.5" />
                {t.name}
                <span className="text-[9px] opacity-70">{t.durationMs}ms</span>
              </span>
            ))}
          </div>
        ) : null}

        {isUser && editing ? (
          <div>
            <textarea
              value={editingText}
              onChange={(e) => onEditingTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onCommitEdit();
                }
                if (e.key === "Escape") onCancelEdit();
              }}
              rows={3}
              className="w-full resize-none rounded-md border border-border-default bg-surface px-2 py-1.5 text-sm text-primary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30"
            />
            <div className="mt-1.5 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={onCancelEdit}
                className="min-h-9 rounded-md px-3 text-xs text-tertiary hover:text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onCommitEdit}
                className="min-h-9 rounded-md bg-brand px-3 text-xs font-medium text-on-brand hover:bg-brand-hover"
              >
                Save & resubmit
              </button>
            </div>
          </div>
        ) : isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
        ) : (
          <div className="prose-chat whitespace-pre-wrap leading-relaxed">
            {m.reasoning ? (
              <details className="mb-2 rounded-md border border-border-subtle bg-surface px-2 py-1 text-[11px] text-tertiary">
                <summary className="cursor-pointer select-none text-[10px] font-medium">Reasoning</summary>
                <p className="mt-1 whitespace-pre-wrap">{m.reasoning}</p>
              </details>
            ) : null}
            {renderMarkdown(extractFollowUps(m.content).body)}
            {m.streaming ? (
              <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-current align-middle opacity-70" />
            ) : null}
            {caption && !m.streaming ? (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-tertiary">
                {caption.tools ? (
                  <Database className="h-3 w-3" />
                ) : (
                  <MessageSquare className="h-3 w-3" />
                )}
                {caption.label}
              </p>
            ) : null}
          </div>
        )}

        {!isUser && m.citations && m.citations.length > 0 && !m.streaming ? (
          <div className="mt-2 border-t border-border-subtle pt-1.5">
            <p className="text-[10px] font-medium text-tertiary">Sources</p>
            <ul className="mt-1 flex flex-wrap gap-1">
              {m.citations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/knowledge?id=${encodeURIComponent(c.id)}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[10px] text-secondary transition hover:border-brand hover:text-brand-text"
                  >
                    <Database className="h-2.5 w-2.5" />
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!editing && !m.streaming ? (
          <div
            className={cx(
              "mt-2 flex flex-wrap items-center gap-1",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            <button
              type="button"
              onClick={onCopy}
              className={cx(
                "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-[12px] sm:min-h-8 sm:min-w-8 sm:text-[11px]",
                isUser ? "text-on-brand/90 hover:bg-brand-hover" : "text-tertiary hover:bg-surface-hover hover:text-primary",
              )}
              aria-label="Copy message"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
            </button>
            {isUser ? (
              <button
                type="button"
                onClick={onEdit}
                className={cx(
                  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-[12px] sm:min-h-8 sm:min-w-8 sm:text-[11px]",
                  isUser ? "text-on-brand/90 hover:bg-brand-hover" : "text-tertiary hover:bg-surface-hover hover:text-primary",
                )}
                aria-label="Edit message"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex min-h-11 items-center justify-center gap-1 rounded-md px-2 text-[12px] text-tertiary hover:bg-surface-hover hover:text-primary sm:min-h-8 sm:text-[11px]"
                aria-label="Regenerate response"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Regenerate</span>
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
