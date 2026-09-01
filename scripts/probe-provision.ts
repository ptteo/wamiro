import { readFileSync } from "node:fs";

async function main() {
  process.env.DATABASE_URL = (readFileSync(".env", "utf8").match(/^DATABASE_URL=(.*)$/m)?.[1] ?? "").replace(
    /sslmode=[^&]*/,
    "",
  );
  const { provisionOrganization } = await import("../src/modules/org/service");
  try {
    const r = await provisionOrganization({
      companyName: "Probe " + Date.now().toString(36),
      adminName: "Probe Admin",
      adminEmail: `probe-${Date.now().toString(36)}@t.test`,
      adminPasswordHash: "probe-hash-not-real",
    });
    console.log("OK", JSON.stringify(r));
  } catch (e) {
    const err = e as Error & { cause?: unknown };
    console.log("ERR:", err.message);
    console.log("CAUSE:", String(err.cause ?? "").slice(0, 400));
  }
  process.exit(0);
}
main();
