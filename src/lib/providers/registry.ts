/**
 * R7 §5/§85 — provider capability registry.
 * One place maps each external capability to its adapter + license + status.
 * Feature code asks the registry; it never imports a vendor SDK directly.
 *
 * Statuses: integrated | optional (works without) | planned.
 * Licenses recorded per doc 04 — verify exact version at adoption time.
 */
export type Capability =
  | "hr"
  | "itsm"
  | "storage"
  | "search"
  | "email"
  | "ai"
  | "identity"
  | "projects"
  | "documents"
  | "analytics"
  | "calendar";

export interface ProviderRecord {
  capability: Capability;
  /** Active adapter id, or null when Wamiro's built-in implementation serves. */
  active: string | null;
  builtIn: string;
  license: string | null;
  status: "integrated" | "optional" | "planned";
  isConfigured: () => boolean;
}

export const REGISTRY: Record<Capability, ProviderRecord> = {
  hr: {
    capability: "hr",
    active: null, // built-in people module is the only implementation (Phase 6 cutover)
    builtIn: "wamiro-people",
    license: null,
    status: "integrated",
    isConfigured: () => true,
  },
  itsm: {
    capability: "itsm",
    active: null,
    builtIn: "wamiro-support",
    license: null,
    status: "integrated",
    isConfigured: () => true,
  },
  storage: {
    capability: "storage",
    active: null,
    builtIn: "local-disk", // MinIO (AGPL-3.0/S3) is the documented scale-out path
    license: null,
    status: "integrated",
    isConfigured: () => true,
  },
  search: {
    capability: "search",
    active: null,
    builtIn: "postgres-ilike", // Meilisearch (MIT) planned for fuzzy/scale
    license: null,
    status: "integrated",
    isConfigured: () => true,
  },
  email: {
    capability: "email",
    active: null,
    builtIn: "smtp", // self-hosted SMTP only — no SendGrid/Resend per doc 04 §4
    license: null,
    status: "integrated",
    isConfigured: () => Boolean(process.env.SMTP_URL && process.env.MAIL_FROM),
  },
  ai: {
    capability: "ai",
    active: null,
    builtIn: "none", // OpenAI-compatible endpoint is optional, never required (§4)
    license: null,
    status: "optional",
    isConfigured: () => false, // resolved lazily by aiConfig()
  },
  identity: {
    capability: "identity",
    active: null,
    builtIn: "wamiro-auth", // scrypt+TOTP; Keycloak (Apache-2.0) = future SSO adapter
    license: null,
    status: "integrated",
    isConfigured: () => true,
  },
  projects: {
    capability: "projects",
    active: null,
    builtIn: "wamiro-work", // OpenProject stays out-of-core per §29
    license: null,
    status: "integrated",
    isConfigured: () => true,
  },
  documents: {
    capability: "documents",
    active: null,
    builtIn: "wamiro-documents",
    license: null,
    status: "integrated",
    isConfigured: () => true,
  },
  analytics: {
    capability: "analytics",
    active: null,
    builtIn: "wamiro-analytics", // Metabase (AGPL/embed) evaluated later
    license: null,
    status: "integrated",
    isConfigured: () => true,
  },
  calendar: {
    capability: "calendar",
    active: null,
    builtIn: "planned-d14", // Cal.com (AGPL) candidate for D14 Workplace
    license: "n/a",
    status: "planned",
    isConfigured: () => false,
  },
};

/** Admin/integrations surface: never leaks secrets — booleans only. */
export function registryStatus() {
  return Object.values(REGISTRY).map((r) => ({
    capability: r.capability,
    active: r.active,
    builtIn: r.builtIn,
    status: r.status,
    externalConfigured: r.isConfigured(),
  }));
}
