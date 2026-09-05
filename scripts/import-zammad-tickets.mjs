/**
 * Legacy-data importer: Zammad ticket export → Wamiro native tickets.
 * Phase 6 cutover helper. Run against the live DB, outside the app.
 *
 * Usage:
 *   node scripts/import-zammad-tickets.mjs --org <organizationId> --file tickets.csv
 *
 * CSV columns (header row required, order-insensitive):
 *   title            — ticket title (required)
 *   description      — first article body (defaults to title)
 *   requester_email  — must match an existing member of the org; rows with
 *                      unknown emails are skipped (never auto-creates users)
 *   assignee_email   — optional; must be an org member
 *   category         — incident | service_request | access | hardware | software | other
 *   priority         — low | medium | high | urgent (Zammad 1–5 also accepted)
 *   status           — new | open | waiting | resolved | closed
 *                      (Zammad states mapped: pending reminder/pending close → waiting)
 *   created_at       — ISO timestamp (defaults to now)
 *   resolved_at      — ISO timestamp (optional)
 *   csat_score       — 1–5 (optional)
 *   csat_comment     — optional
 *
 * Behavior: insert-only, idempotent per run is NOT guaranteed (no dedupe key) —
 * re-running duplicates rows; export once. SLA deadlines are recomputed by the
 * normal ticket pipeline on read/mutation.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function readEnv() {
  try {
    for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* .env optional */
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  };
  return { orgId: get("--org"), file: get("--file") };
}

/** Minimal RFC-4180-ish CSV parser: handles quoted fields and embedded commas. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

const CATEGORIES = new Set(["incident", "service_request", "access", "hardware", "software", "other"]);
const PRIORITY_MAP = { "1": "low", "2": "medium", "3": "high", "4": "urgent", "5": "urgent" };
const STATUS_MAP = {
  "pending reminder": "waiting",
  "pending close": "waiting",
  merged: "closed",
};

readEnv();
const { orgId, file } = parseArgs();
if (!orgId || !file) {
  console.error("Usage: node scripts/import-zammad-tickets.mjs --org <organizationId> --file <tickets.csv>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not found (.env or environment)");
  process.exit(1);
}

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const org = await client.query("SELECT id FROM organizations WHERE id = $1", [orgId]);
  if (org.rowCount === 0) {
    console.error(`Organization ${orgId} not found.`);
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(file, "utf8"));
  if (rows.length < 2) {
    console.error("CSV has no data rows.");
    process.exit(1);
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const pick = (row, name) => {
    const i = idx(name);
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };

  // Org member index by email.
  const members = new Map(
    (
      await client.query(
        `SELECT u.id, lower(u.email) AS email FROM users u WHERE u.organization_id = $1`,
        [orgId],
      )
    ).rows.map((u) => [u.email, u.id]),
  );

  let imported = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const title = pick(row, "title");
    const requesterEmail = pick(row, "requester_email").toLowerCase();
    if (!title || !requesterEmail) {
      skipped++;
      continue;
    }
    const requesterId = members.get(requesterEmail);
    if (!requesterId) {
      console.warn(`skip "${title.slice(0, 60)}": requester ${requesterEmail} is not an org member`);
      skipped++;
      continue;
    }

    let category = pick(row, "category");
    if (!CATEGORIES.has(category)) category = "other";

    let priority = pick(row, "priority").toLowerCase();
    priority = PRIORITY_MAP[priority] ?? (["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium");

    let status = pick(row, "status").toLowerCase();
    status = STATUS_MAP[status] ?? (["new", "open", "waiting", "resolved", "closed"].includes(status) ? status : "new");

    const assigneeEmail = pick(row, "assignee_email").toLowerCase();
    const assigneeId = assigneeEmail ? (members.get(assigneeEmail) ?? null) : null;

    const createdAt = pick(row, "created_at") ? new Date(pick(row, "created_at")) : new Date();
    const resolvedAt = pick(row, "resolved_at") ? new Date(pick(row, "resolved_at")) : null;
    const csat = /^[1-5]$/.test(pick(row, "csat_score")) ? Number(pick(row, "csat_score")) : null;
    const description = pick(row, "description") || title;

    await client.query(
      `INSERT INTO tickets
         (organization_id, title, description, category, priority, status,
          requester_id, assignee_id, resolved_at, csat_score, csat_comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        orgId,
        title,
        description,
        category,
        priority,
        status,
        requesterId,
        assigneeId,
        resolvedAt,
        csat,
        pick(row, "csat_comment") || null,
        createdAt,
      ],
    );
    imported++;
  }

  console.log(`Zammad ticket import done — imported ${imported} · skipped ${skipped} (org ${orgId})`);
} finally {
  await client.end();
}