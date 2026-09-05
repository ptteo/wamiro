/**
 * Legacy-data importer: Frappe HR employee master → Wamiro tenant.
 * Phase 6 cutover helper so a company migrating off Frappe HR can move its
 * employee master in one pass. Run against the live DB, outside the app.
 *
 * Usage:
 *   node scripts/import-frappe-employees.mjs --org <organizationId> --file employees.csv
 *
 * CSV columns (header row required, order-insensitive):
 *   employee_name   — display name (required)
 *   company_email   — login email (required, globally unique)
 *   designation     — job title
 *   department      — department name (created if missing)
 *   reports_to_email— manager's company_email (must appear in this file or already exist)
 *   hired_on        — YYYY-MM-DD
 *   employment_type — full_time | part_time | contract | intern | probation
 *   bank_name, bank_account_no, ifsc_code — payroll bank details
 *
 * Behavior: existing org users are updated (title/department/manager/bank);
 * unknown emails are created as invited members (random temp password, admin
 * resets it) with the employee role; emails already used by another tenant are
 * skipped with a warning. Idempotent — safe to re-run.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
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

const EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "contract", "intern", "probation"]);

readEnv();
const { orgId, file } = parseArgs();
if (!orgId || !file) {
  console.error("Usage: node scripts/import-frappe-employees.mjs --org <organizationId> --file <employees.csv>");
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
  // Validate the org exists.
  const org = await client.query("SELECT id FROM organizations WHERE id = $1", [orgId]);
  if (org.rowCount === 0) {
    console.error(`Organization ${orgId} not found.`);
    process.exit(1);
  }

  const [employeeRole] = (
    await client.query("SELECT id FROM roles WHERE organization_id = $1 AND key = 'employee'", [orgId])
  ).rows;
  if (!employeeRole) {
    console.error(`No role with key 'employee' in organization ${orgId} — run the org provisioning first.`);
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

  // Pre-load existing users/departments for the org.
  const existingUsers = new Map(
    (
      await client.query("SELECT id, organization_id, email FROM users WHERE lower(email) = ANY($1)", [
        rows.slice(1).map((r) => pick(r, "company_email").toLowerCase()).filter(Boolean),
      ])
    ).rows.map((u) => [u.email.toLowerCase(), u]),
  );
  const existingDepts = new Map(
    (
      await client.query("SELECT id, name FROM departments WHERE organization_id = $1", [orgId])
    ).rows.map((d) => [d.name.toLowerCase(), d.id]),
  );
  const existingEmployees = new Map(
    (
      await client.query("SELECT id, user_id FROM employees WHERE organization_id = $1", [orgId])
    ).rows.map((e) => [e.user_id, e.id]),
  );

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const email = pick(row, "company_email").toLowerCase();
    const name = pick(row, "employee_name");
    if (!email || !name) {
      skipped++;
      continue;
    }

    // Department (create if missing).
    let deptId = null;
    const deptName = pick(row, "department");
    if (deptName) {
      deptId = existingDepts.get(deptName.toLowerCase()) ?? null;
      if (!deptId) {
        const d = await client.query(
          "INSERT INTO departments (organization_id, name) VALUES ($1, $2) RETURNING id",
          [orgId, deptName],
        );
        deptId = d.rows[0].id;
        existingDepts.set(deptName.toLowerCase(), deptId);
      }
    }

    // Manager (by email) — resolves after its row is processed in a later pass
    // or from pre-existing users; resolved at the end via managerEmails.
    const managerEmail = pick(row, "reports_to_email").toLowerCase();

    const employmentType = EMPLOYMENT_TYPES.has(pick(row, "employment_type"))
      ? pick(row, "employment_type")
      : "full_time";
    const hiredOn = /^\d{4}-\d{2}-\d{2}$/.test(pick(row, "hired_on")) ? pick(row, "hired_on") : null;

    const existing = existingUsers.get(email);
    let userId;
    if (existing) {
      if (existing.organization_id !== orgId) {
        console.warn(`skip ${email}: already belongs to another tenant`);
        skipped++;
        continue;
      }
      userId = existing.id;
      await client.query(
        `UPDATE users SET name = $1 WHERE id = $2`,
        [name, userId],
      );
      updated++;
    } else {
      const tempHash = randomBytes(18).toString("base64url"); // placeholder; admin resets
      const ins = await client.query(
        `INSERT INTO users (organization_id, email, name, password_hash)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [orgId, email, name, tempHash],
      );
      userId = ins.rows[0].id;
      await client.query(
        "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, employeeRole.id],
      );
      imported++;
    }

    await client.query(
      `INSERT INTO employees
         (organization_id, user_id, job_title, department_id, employment_type, hired_at, bank_name, bank_account_no, ifsc_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET
         job_title = EXCLUDED.job_title,
         department_id = EXCLUDED.department_id,
         employment_type = EXCLUDED.employment_type,
         hired_at = EXCLUDED.hired_at,
         bank_name = EXCLUDED.bank_name,
         bank_account_no = EXCLUDED.bank_account_no,
         ifsc_code = EXCLUDED.ifsc_code`,
      [
        orgId,
        userId,
        pick(row, "designation") || null,
        deptId,
        employmentType,
        hiredOn,
        pick(row, "bank_name") || null,
        pick(row, "bank_account_no") || null,
        pick(row, "ifsc_code") || null,
      ],
    );
    existingUsers.set(email, { id: userId, organization_id: orgId, email });
    existingEmployees.set(userId, true);
  }

  // Second pass: resolve manager links by email.
  const idByEmail = new Map(existingUsers.values().map((u) => [u.email.toLowerCase(), u.id]));
  for (const row of rows.slice(1)) {
    const email = pick(row, "company_email").toLowerCase();
    const managerEmail = pick(row, "reports_to_email").toLowerCase();
    const userId = idByEmail.get(email);
    const managerUserId = idByEmail.get(managerEmail);
    if (userId && managerUserId && managerUserId !== userId) {
      await client.query("UPDATE employees SET manager_user_id = $1 WHERE organization_id = $2 AND user_id = $3", [
        managerUserId,
        orgId,
        userId,
      ]);
    }
  }

  console.log(
    `Frappe employee import done — imported ${imported} · updated ${updated} · skipped ${skipped} (org ${orgId})`,
  );
} finally {
  await client.end();
}