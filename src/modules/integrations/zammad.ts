/**
 * Zammad adapter (blueprint §30/§42): helpdesk/tickets owned by Zammad,
 * surfaced inside Wamiro. Token-authenticated REST.
 *
 * Config (env): ZAMMAD_BASE_URL, ZAMMAD_TOKEN
 */
export function zammadConfig(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.ZAMMAD_BASE_URL?.replace(/\/$/, "");
  const token = process.env.ZAMMAD_TOKEN;
  return baseUrl && token ? { baseUrl, token } : null;
}

interface ZammadTicket {
  id: number;
  title: string;
  state: string;
  priority: string;
  created_at: string;
  updated_at?: string;
  group_id: number;
  customer_id?: number;
  owner_id?: number;
}

export interface ZammadArticle {
  id: number;
  ticket_id: number;
  subject?: string;
  body?: string;
  sender?: string;
  internal?: boolean;
  created_at: string;
}

export interface TicketDetail {
  id: number;
  title: string;
  state: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  customerId: number | null;
  ownerId: number | null;
  articles: ZammadArticle[];
}

async function zammadFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const cfg = zammadConfig();
  if (!cfg) throw new Error("ZAMMAD_NOT_CONFIGURED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Token token=${cfg.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`zammad ${res.status} on ${path}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Tickets where the user is the customer, newest first. */
export async function listMyTickets(email: string): Promise<
  { id: number; title: string; state: string; priority: string; createdAt: string; updatedAt: string | null }[]
> {
  const tickets = await zammadFetch<ZammadTicket[]>(
    `/tickets/search?query=customer.email:${encodeURIComponent(email)}&sort_by=created_at&order_by=desc`,
  );
  return tickets.slice(0, 50).map((t) => ({
    id: t.id,
    title: t.title,
    state: t.state,
    priority: t.priority,
    createdAt: t.created_at,
    updatedAt: t.updated_at ?? null,
  }));
}

/** Single ticket with article history. Caller must enforce ownership. */
export async function getTicket(
  email: string,
  id: number,
): Promise<TicketDetail> {
  // 1. fetch the ticket itself
  const t = await zammadFetch<ZammadTicket>(`/tickets/${id}`);
  // 2. verify the requesting user is the customer (Zammad-side authorization
  //    re-check, mirroring the same rule we use for the list endpoint)
  const found = await zammadFetch<{ assets?: { User?: Record<string, { email: string; id: number }> } }>(
    `/users/search?query=email:${encodeURIComponent(email)}`,
  );
  const me = Object.values(found.assets?.User ?? {}).find((u) => u.email === email);
  if (t.customer_id && me && t.customer_id !== me.id) {
    throw new Error("zammad 403");
  }
  // 3. fetch the article timeline
  const articles = await zammadFetch<ZammadArticle[]>(`/tickets/${id}/articles`);
  return {
    id: t.id,
    title: t.title,
    state: t.state,
    priority: t.priority,
    createdAt: t.created_at,
    updatedAt: t.updated_at ?? t.created_at,
    customerId: t.customer_id ?? null,
    ownerId: t.owner_id ?? null,
    articles: (articles ?? [])
      .filter((a) => !a.internal)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((a) => ({
        id: a.id,
        ticket_id: a.ticket_id,
        subject: a.subject,
        body: a.body,
        sender: a.sender,
        internal: a.internal,
        created_at: a.created_at,
      })),
  };
}

/** Create a ticket on behalf of an authenticated Wamiro user. */
export async function createTicket(
  email: string,
  name: string,
  input: { title: string; body: string },
): Promise<{ id: number }> {
  // resolve or create the end-user in Zammad by email
  let userId: number | undefined;
  const found = await zammadFetch<{ assets?: { User?: Record<string, { email: string; id: number }> } }>(
    `/users/search?query=email:${encodeURIComponent(email)}`,
  );
  const users = Object.values(found.assets?.User ?? {});
  userId = users.find((u) => u.email === email)?.id;
  if (!userId) {
    const created = await zammadFetch<{ id: number }>("/users", {
      method: "POST",
      body: JSON.stringify({
        login: email,
        email,
        firstname: name.split(" ")[0] || name,
        lastname: name.split(" ").slice(1).join(" ") || "-",
      }),
    });
    userId = created.id;
  }

  const ticket = await zammadFetch<{ id: number }>("/tickets", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      group: "Users",
      customer_id: `remote:${email}`,
      customer_id_alt: userId,
      article: {
        subject: input.title,
        body: input.body,
        type: "note",
        internal: false,
        sender: "Customer",
      },
    }),
  });
  return { id: ticket.id };
}

/** Groups list is not needed by Wamiro v1 — kept minimal intentionally. */
