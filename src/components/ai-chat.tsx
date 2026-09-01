"use client";

import { useEffect, useRef, useState } from "react";

import { Card, CardHeader, btn, input } from "./ui";

interface Msg {
  role: "user" | "assistant";
  content: string;
  citations?: { id: string; title: string }[];
  mode?: string;
}

const FALLBACK_SUGGESTIONS = [
  "How much leave do I have left?",
  "What's waiting for my approval?",
  "Summarize recent announcements",
];

export function AiChat({
  configured,
  conversationId,
  initialMessages = [],
  suggestions,
}: {
  configured: boolean;
  conversationId?: string;
  initialMessages?: Msg[];
  suggestions?: string[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryHint, setRetryHint] = useState<"retry" | "try_no_tools" | "wait" | null>(null);
  const [stickyBottom, setStickyBottom] = useState(true);
  const lastSentRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const initialSuggestions = suggestions && suggestions.length > 0 ? suggestions : FALLBACK_SUGGESTIONS;

  useEffect(() => { setMessages(initialMessages); }, [conversationId, initialMessages]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setStickyBottom(distance < 80);
  }

  useEffect(() => {
    if (stickyBottom) {
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: 1e6 }));
    }
  }, [messages, stickyBottom]);

  function scrollToBottom() {
    listRef.current?.scrollTo({ top: 1e6, behavior: "smooth" });
    setStickyBottom(true);
  }

  async function send(text: string, mode: "auto" | "noTools" = "auto") {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setRetryHint(null);
    setBusy(true);
    lastSentRef.current = content;
    const history = [...messages, { role: "user" as const, content }];
    setMessages(history);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          messages: history,
          noTools: mode === "noTools",
        }),
        signal: controller.signal,
      });
      const data = (await res.json()) as {
        answer?: string;
        conversationId?: string;
        citations?: { id: string; title: string }[];
        mode?: string;
        error?: { code?: string; message?: string; retry_hint?: string | null };
      };
      if (!res.ok) {
        setError(data.error?.message ?? "The assistant is unavailable right now.");
        setRetryHint(
          data.error?.retry_hint === "try_no_tools" ? "try_no_tools"
          : data.error?.retry_hint === "wait" ? "wait"
          : "retry",
        );
      } else if (data.answer) {
        setMessages([...history, { role: "assistant", content: data.answer, citations: data.citations ?? [], mode: data.mode }]);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // user-initiated stop; the user message stays in the log
      } else {
        setError("Network error — please try again.");
        setRetryHint("retry");
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function retry() {
    if (lastSentRef.current) void send(lastSentRef.current, "auto");
  }
  function retryWithoutTools() {
    if (lastSentRef.current) void send(lastSentRef.current, "noTools");
  }

  return (
    <Card>
      <CardHeader title="Assistant" subtitle={configured ? "Answers grounded in your own data via tools" : "Not configured on this deployment"} />
      <div className="relative">
        <div
          ref={listRef}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          className="max-h-[26rem] min-h-48 space-y-3 overflow-auto px-5 py-4"
        >
          {messages.length === 0 && !busy && (
            <div className="py-6 text-center">
              <p className="text-sm text-tertiary">
                {configured
                  ? "Ask about your leave, approvals, announcements, or the knowledge base."
                  : "The assistant isn't configured on this deployment yet."}
              </p>
              {configured && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {initialSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className={`${btn.secondary} ${btn.small}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-brand text-on-brand"
                  : "bg-surface-subtle text-primary"
              }`}
            >
              {m.content}
              {m.role === "assistant" && m.mode && (
                <div className="mt-1.5 text-[10px] uppercase tracking-wide text-tertiary">
                  {m.mode === "prefetched_only" ? "📌 from your live data" :
                   m.mode === "auto_tools" || m.mode === "tools" ? "🔍 looked up company data" :
                   m.mode === "auto_no_tools" || m.mode === "no_tools" ? "💬 general question" :
                   m.mode}
                </div>
              )}
              {m.citations && m.citations.length > 0 ? (
                <div className="mt-2 border-t border-border-subtle pt-1.5">
                  <p className="text-[11px] font-medium text-tertiary">Sources</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {m.citations.map((c) => (
                      <li key={c.id}>
                        <a
                          href={`/knowledge?id=${encodeURIComponent(c.id)}`}
                          className="text-xs text-brand-text hover:underline"
                        >
                          {c.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-surface-subtle px-4 py-2.5 text-sm text-tertiary">
                <span className="inline-flex gap-1" aria-label="Assistant is typing">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                </span>
              </div>
            </div>
          )}
        </div>
        {!stickyBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border-default bg-surface px-3 py-1 text-xs shadow-sm hover:bg-surface-hover"
            aria-label="Scroll to latest"
          >
            ↓ Latest
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-5 py-2 text-sm text-danger">
          <span>{error}</span>
          {retryHint === "try_no_tools" ? (
            <button
              type="button"
              onClick={retryWithoutTools}
              className={`${btn.secondary} ${btn.small}`}
            >
              Retry without company data
            </button>
          ) : retryHint === "wait" ? (
            <button
              type="button"
              onClick={retry}
              className={`${btn.secondary} ${btn.small}`}
            >
              Wait & retry
            </button>
          ) : (
            <button type="button" onClick={retry} className={`${btn.secondary} ${btn.small}`}>
              Retry
            </button>
          )}
          {retryHint === "try_no_tools" && (
            <button
              type="button"
              onClick={retry}
              className="text-xs text-secondary hover:text-primary"
            >
              Retry anyway
            </button>
          )}
        </div>
      )}

      <form
        className="flex items-center gap-2 border-t border-border-subtle px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const text = String(f.get("message") ?? "");
          (e.target as HTMLFormElement).reset();
          send(text, "auto");
        }}
      >
        <input
          name="message"
          className={input}
          placeholder={configured ? "Ask anything…" : "Not configured"}
          aria-label="Message the assistant"
          disabled={!configured}
          maxLength={4000}
          autoComplete="off"
        />
        {busy ? (
          <button type="button" onClick={stop} className={btn.danger}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!configured} className={btn.primary}>
            Send
          </button>
        )}
      </form>
    </Card>
  );
}
