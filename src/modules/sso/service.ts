/**
 * SSO / OIDC (Phase C — enterprise trust). Lets a company sign its employees
 * in through its identity provider (Okta, Entra ID, Google Workspace, Keycloak…)
 * with zero-dependency JWT verification (node:crypto only).
 *
 *   Config   one per org (sso_configs); oidc today, saml stored for the IdP
 *            bridge. Admin-managed, audited.
 *   Flow     authorization-code + PKCE (S256) → token exchange → ID-token
 *            signature verified against the provider's JWKS → nonce + issuer
 *            + audience checked → user matched by email or JIT-provisioned
 *            (role from default_role_key) → normal Wamiro session issued.
 *
 * No password is ever involved on this path: provisioned identities are
 * stamped auth_method = 'sso' and the password login route rejects them.
 */
import { createHash, createHmac, createVerify, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";

import { db, first } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { env } from "@/lib/env";
import {
  employees,
  organizationMemberships,
  roles,
  ssoConfigs,
  ssoStates,
  userRoles,
  users,
} from "@/db/schema";

const STATE_TTL_MS = 10 * 60_000; // auth states expire in 10 minutes

// ---------------------------------------------------------------------------
// Config CRUD (admin)
// ---------------------------------------------------------------------------

/** Cheap pre-auth check: does this tenant offer SSO on its branded login? */
export async function isSsoAvailable(orgId: string): Promise<boolean> {
  const [cfg] = await db
    .select({ id: ssoConfigs.id })
    .from(ssoConfigs)
    .where(and(eq(ssoConfigs.organizationId, orgId), eq(ssoConfigs.enabled, true)))
    .limit(1);
  return Boolean(cfg);
}

export interface SsoConfigInput {
  name?: string;
  provider?: string;
  issuer?: string;
  clientId?: string | null;
  clientSecret?: string | null;
  discoveryUrl?: string | null;
  metadataUrl?: string | null;
  jitProvision?: boolean;
  defaultRoleKey?: string;
}

/** Public shape — the client secret is never returned (masked instead). */
export async function getConfig(orgId: string) {
  const [cfg] = await db.select().from(ssoConfigs).where(eq(ssoConfigs.organizationId, orgId)).limit(1);
  if (!cfg) return null;
  return { ...cfg, clientSecret: cfg.clientSecret ? "••••••••" : null };
}

export async function saveConfig(orgId: string, actorId: string, input: SsoConfigInput) {
  if (!input.issuer?.trim()) throw ApiError.badRequest("issuer is required");
  const existing = await getConfig(orgId);
  const values = {
    name: input.name?.trim().slice(0, 120) || "Single sign-on",
    provider: input.provider ?? "oidc",
    issuer: input.issuer.trim() as string,
    clientId: input.clientId?.trim() || null,
    clientSecret:
      input.clientSecret?.trim() ||
      (existing?.clientSecret && existing.clientSecret !== "••••••••" ? existing.clientSecret : null),
    discoveryUrl: input.discoveryUrl?.trim() || null,
    metadataUrl: input.metadataUrl?.trim() || null,
    jitProvision: input.jitProvision ?? false,
    defaultRoleKey: input.defaultRoleKey ?? "employee",
    updatedAt: new Date(),
  };

  let row;
  if (existing) {
    [row] = await db.update(ssoConfigs).set(values).where(eq(ssoConfigs.organizationId, orgId)).returning();
  } else {
    [row] = await db
      .insert(ssoConfigs)
      .values({ organizationId: orgId, ...values })
      .returning();
  }
  if (!row) throw ApiError.notFound();

  await audit({
    organizationId: orgId,
    actorUserId: actorId,
    action: existing ? "SSO_CONFIG_UPDATED" : "SSO_CONFIG_CREATED",
    entityType: "sso_config",
    entityId: row.id,
    newValue: { provider: row.provider, issuer: row.issuer, jitProvision: row.jitProvision },
  });
  return { ...row, clientSecret: null };
}

export async function setEnabled(orgId: string, actorId: string, enabled: boolean) {
  const [row] = await db
    .update(ssoConfigs)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(ssoConfigs.organizationId, orgId))
    .returning();
  if (!row) throw ApiError.notFound("No SSO configuration exists yet");
  await audit({
    organizationId: orgId,
    actorUserId: actorId,
    action: enabled ? "SSO_ENABLED" : "SSO_DISABLED",
    entityType: "sso_config",
    entityId: row.id,
  });
  return { ok: true, enabled };
}

export async function deleteConfig(orgId: string, actorId: string) {
  const [row] = await db.delete(ssoConfigs).where(eq(ssoConfigs.organizationId, orgId)).returning();
  if (!row) throw ApiError.notFound();
  await audit({
    organizationId: orgId,
    actorUserId: actorId,
    action: "SSO_CONFIG_DELETED",
    entityType: "sso_config",
    entityId: row.id,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// JWT / JWKS (zero-dependency verification)
// ---------------------------------------------------------------------------

interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string; // RSA modulus (base64url)
  e?: string; // RSA exponent (base64url)
  crv?: string; // EC curve
  x?: string; // EC x (base64url)
  y?: string; // EC y (base64url)
  k?: string; // oct key (base64url) — HS256 symmetric
}

function b64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Verify an RS256 / ES256 (or HS256) JWT against a JWKS. Exported for tests. */
export async function verifyIdToken(token: string, expectedIssuer: string, expectedAudience: string, expectedNonce: string, jwksUri: string): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw ApiError.unauthorized("Malformed ID token");
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64url(headerB64).toString("utf8"));
    payload = JSON.parse(b64url(payloadB64).toString("utf8"));
  } catch {
    throw ApiError.unauthorized("Invalid ID token encoding");
  }

  const alg = header.alg ?? "";
  if (!alg.startsWith("RS") && !alg.startsWith("ES") && alg !== "HS256") {
    throw ApiError.unauthorized(`Unsupported ID token algorithm: ${alg}`);
  }

  const nonceClaim: unknown = payload.nonce;
  const issClaim: unknown = payload.iss;
  const audClaim: unknown = payload.aud;
  if (typeof nonceClaim !== "string") throw ApiError.unauthorized("ID token nonce mismatch");
  const a = Buffer.from(nonceClaim);
  const b = Buffer.from(expectedNonce);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw ApiError.unauthorized("ID token nonce mismatch");
  if (issClaim !== expectedIssuer) throw ApiError.unauthorized("ID token issuer mismatch");
  const audienceOk = Array.isArray(audClaim) ? audClaim.includes(expectedAudience) : audClaim === expectedAudience;
  if (!audienceOk) throw ApiError.unauthorized("ID token audience mismatch");
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
    throw ApiError.unauthorized("ID token expired");
  }

  const data = Buffer.from(`${headerB64}.${payloadB64}`, "utf8");
  const signature = b64url(signatureB64);

  if (alg === "HS256") {
    // Symmetric fallback (e.g. some Auth0 tenants): derive the key from the
    // JWKS `k` value rather than from a shared secret we don't store.
    const jwks = (await (await fetch(jwksUri, { signal: AbortSignal.timeout(10_000) })).json()) as { keys?: Jwk[] };
    const key = (jwks.keys ?? []).find((k) => k.kty === "oct" && (k.kid === header.kid || !header.kid));
    if (!key?.k) throw ApiError.unauthorized("No symmetric key found in JWKS");
    const hmac = createHmac("sha256", b64url(key.k));
    hmac.update(data);
    const mac = hmac.digest();
    if (!timingSafeEqual(mac, signature)) throw ApiError.unauthorized("ID token signature invalid");
    return payload;
  }

  const jwks = (await (await fetch(jwksUri, { signal: AbortSignal.timeout(10_000) })).json()) as { keys?: Jwk[] };
  const key = (jwks.keys ?? []).find((k) => k.kid === header.kid || !header.kid);
  if (!key) throw ApiError.unauthorized("No matching signing key in JWKS");

  let verify: ReturnType<typeof createVerify>;
  try {
    verify = createVerify(alg === "ES256" ? "sha256" : "RSA-SHA256");
  } catch {
    throw ApiError.unauthorized(`Unsupported verification algorithm: ${alg}`);
  }
  verify.update(data);
  verify.end();

  const publicKey = toPem(key);
  // JWTs carry ECDSA signatures as raw r||s; node:crypto verify() wants DER.
  const verifySignature = alg.startsWith("ES") ? rawEcdsaToDer(signature) : signature;
  let valid = false;
  try {
    valid = verify.verify(publicKey, verifySignature);
  } catch {
    valid = false;
  }
  if (!valid) throw ApiError.unauthorized("ID token signature invalid");
  return payload;
}

/** Convert a JWK to a PEM (RSA / EC / oct) for node:crypto. Exported for tests. */
export function toPem(jwk: Jwk): string {
  if (jwk.kty === "RSA" && jwk.n && jwk.e) {
    // SPKI: SEQUENCE { SEQUENCE { OID rsaEncryption, NULL }, BIT STRING { RSAPublicKey } }
    const rsaPub = derSequence(derInteger(b64url(jwk.n)), derInteger(b64url(jwk.e)));
    const der = derSequence(
      derSequence(derOid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]), derTag(0x05, Buffer.alloc(0))),
      derBitString(rsaPub),
    );
    return `-----BEGIN PUBLIC KEY-----\n${der.toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----\n`;
  }
  if (jwk.kty === "EC" && jwk.crv === "P-256" && jwk.x && jwk.y) {
    // EC point = 0x04 || x || y, wrapped in the SPKI structure for P-256.
    const point = Buffer.concat([Buffer.from([0x04]), b64url(jwk.x), b64url(jwk.y)]);
    // OIDs: 1.2.840.10045.2.1 (id-ecPublicKey), 1.2.840.10045.3.1.7 (prime256v1)
    const der = derSequence(
      derSequence(
        derOid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]),
        derOid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]),
      ),
      derBitString(point),
    );
    return `-----BEGIN PUBLIC KEY-----\n${der.toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----\n`;
  }
  throw ApiError.unauthorized("Unsupported JWK type");
}

/** Re-wrap a raw r||s ECDSA signature (JWT format) as DER for node:crypto. */
function rawEcdsaToDer(raw: Buffer): Buffer {
  const size = raw.length / 2;
  const r = raw.subarray(0, size);
  const s = raw.subarray(size);
  const trim = (b: Buffer): Buffer => {
    let v = b;
    while (v.length > 1 && v[0] === 0) v = v.subarray(1);
    return v;
  };
  return derSequence(derInteger(trim(r)), derInteger(trim(s)));
}

// Minimal DER helpers (node:crypto has no public-key encoder).
function derLength(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function derTag(tag: number, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}
function derSequence(...parts: Buffer[]): Buffer {
  return derTag(0x30, Buffer.concat(parts));
}
function derInteger(int: Buffer): Buffer {
  // Prepend 0x00 when the high bit is set so the integer stays positive.
  const first = int[0] ?? 0;
  const body = (first & 0x80) !== 0 ? Buffer.concat([Buffer.from([0x00]), int]) : int;
  return derTag(0x02, body);
}
function derOid(oid: number[]): Buffer {
  return derTag(0x06, Buffer.from(oid));
}
function derBitString(data: Buffer): Buffer {
  return derTag(0x03, Buffer.concat([Buffer.from([0x00]), data]));
}

// ---------------------------------------------------------------------------
// OIDC flow
// ---------------------------------------------------------------------------

interface OidcDiscovery {
  issuer: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  jwks_uri?: string;
}

async function discover(cfg: { issuer: string; discoveryUrl?: string | null }): Promise<OidcDiscovery> {
  const discoveryUrl =
    cfg.discoveryUrl?.trim() || `${cfg.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(discoveryUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw ApiError.badGateway("Could not reach the identity provider's discovery document");
  return (await res.json()) as OidcDiscovery;
}

/** Begin the authorization-code + PKCE flow. Returns the IdP redirect URL. */
export async function beginLogin(orgId: string, redirectTo?: string) {
  const [cfg] = await db.select().from(ssoConfigs).where(eq(ssoConfigs.organizationId, orgId)).limit(1);
  if (!cfg) throw ApiError.notFound("SSO is not configured for this organization");
  if (!cfg.enabled) throw ApiError.forbidden("SSO is disabled for this organization");
  if (!cfg.clientId) throw ApiError.badRequest("SSO client_id is not configured");

  const meta = await discover(cfg);
  if (!meta.authorization_endpoint) {
    throw ApiError.badGateway("Identity provider did not expose an authorization endpoint");
  }

  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  // The verifier is needed again (plaintext) at the token exchange, so the
  // state row carries it; it is deleted on use and expires in 10 minutes.
  await db.insert(ssoStates).values({
    state,
    organizationId: orgId,
    nonce,
    codeVerifier: codeVerifier,
    redirectTo: redirectTo?.slice(0, 500) ?? null,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: `${env.APP_URL}/api/v1/auth/sso/callback`,
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return { redirectUrl: `${meta.authorization_endpoint}?${params.toString()}` };
}

export interface SsoCallbackResult {
  redirectTo: string;
  provisioned: boolean;
  /** Set by completeLogin so the route can hand the session cookie out. */
  sessionToken: string;
  sessionExpiresAt: Date;
}

/** Complete the flow: exchange the code, verify the ID token, sign the user in. */
export async function completeLogin(
  params: { code?: string; state?: string; error?: string },
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<SsoCallbackResult> {
  if (params.error) throw ApiError.forbidden(`Identity provider rejected the sign-in: ${params.error}`);
  if (!params.code || !params.state) throw ApiError.badRequest("Missing authorization code or state");

  const now = Date.now();
  const [stateRow] = await db
    .select()
    .from(ssoStates)
    .where(and(eq(ssoStates.state, params.state), gt(ssoStates.expiresAt, new Date(now))))
    .limit(1);
  if (!stateRow) throw ApiError.unauthorized("This sign-in request has expired. Please try again.");

  const [cfg] = await db
    .select()
    .from(ssoConfigs)
    .where(and(eq(ssoConfigs.organizationId, stateRow.organizationId), eq(ssoConfigs.enabled, true)))
    .limit(1);
  if (!cfg) throw ApiError.forbidden("SSO is not enabled for this organization");

  const meta2 = await discover(cfg);
  if (!meta2.token_endpoint || !meta2.jwks_uri) {
    throw ApiError.badGateway("Identity provider did not expose token or JWKS endpoints");
  }

  // ---- token exchange (authorization code + PKCE verifier) ----
  const exchange = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: `${env.APP_URL}/api/v1/auth/sso/callback`,
    code_verifier: stateRow.codeVerifier ?? "",
  });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  const clientId = cfg.clientId ?? "";
  const clientSecret = cfg.clientSecret ?? "";
  if (clientId && clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    exchange.set("client_id", clientId);
  }
  const tokenRes = await fetch(meta2.token_endpoint, {
    method: "POST",
    headers,
    body: exchange.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const tokenBody = (await tokenRes.json().catch(() => null)) as { id_token?: string; error?: string } | null;
  if (!tokenRes.ok || !tokenBody?.id_token) {
    throw ApiError.badGateway(tokenBody?.error ? `Token exchange failed: ${tokenBody.error}` : "Token exchange failed");
  }

  const claims = await verifyIdToken(tokenBody.id_token, cfg.issuer ?? "", cfg.clientId ?? "", stateRow.nonce ?? "", meta2.jwks_uri);

  // ---- resolve / provision the identity ----
  const email = String(claims.email ?? claims.preferred_username ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw ApiError.unauthorized("The identity provider did not return a valid email");
  const name = String(claims.name ?? claims.preferred_username ?? email.split("@")[0]).slice(0, 120);
  const sub = String(claims.sub ?? "");

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, stateRow.organizationId), eq(users.email, email)))
    .limit(1);

  let userId: string;
  let provisioned = false;
  if (existing) {
    if (existing.status === "suspended") throw ApiError.forbidden("This account is suspended");
    userId = existing.id;
    // Keep the SSO subject linked so the IdP can be swapped cleanly later.
    if (sub && existing.ssoSub !== sub) {
      await db.update(users).set({ ssoSub: sub, lastLoginAt: new Date() }).where(eq(users.id, existing.id));
    } else {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, existing.id));
    }
  } else {
    if (!cfg.jitProvision) {
      throw ApiError.unauthorized("No account exists for this email. Ask an administrator to invite you first.");
    }
    provisioned = true;
    const roleId = await defaultRoleId(stateRow.organizationId, cfg.defaultRoleKey);
    const user = first(
      await db
        .insert(users)
        .values({
          organizationId: stateRow.organizationId,
          email,
          name,
          // Unusable random hash: password login is rejected for SSO identities.
          passwordHash: await hashPassword(randomBytes(18).toString("base64url")),
          authMethod: "sso",
          ssoSub: sub || null,
          status: "active",
          lastLoginAt: new Date(),
        })
        .returning(),
    );
    if (!user) throw ApiError.notFound();
    userId = user.id;
    await db.insert(organizationMemberships).values({ userId, organizationId: stateRow.organizationId }).onConflictDoNothing();
    await db
      .insert(employees)
      .values({ organizationId: stateRow.organizationId, userId, jobTitle: "Provisioned via SSO" })
      .onConflictDoNothing();
    if (roleId) await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
  }

  // Consume the one-time state + issue the normal session.
  await db.delete(ssoStates).where(eq(ssoStates.state, params.state));
  const session = await createSession(userId, { ip: meta.ip, userAgent: meta.userAgent });

  await audit({
    organizationId: stateRow.organizationId,
    actorUserId: userId,
    action: provisioned ? "SSO_USER_PROVISIONED" : "SSO_LOGIN",
    entityType: "user",
    entityId: userId,
    newValue: { email, provisioned },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  // Returned to the route so it can set the session cookie.
  return {
    redirectTo: stateRow.redirectTo && stateRow.redirectTo.startsWith("/") ? stateRow.redirectTo : "/home",
    provisioned,
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
  };
}

async function defaultRoleId(orgId: string, roleKey: string): Promise<string | null> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.organizationId, orgId), eq(roles.key, roleKey)))
    .limit(1);
  return role?.id ?? null;
}

// (The code verifier is stored plaintext on the one-time, 10-minute state row
// because it must be replayed to the IdP at token exchange.)