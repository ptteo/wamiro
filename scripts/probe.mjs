/**
 * Connectivity probe — prints every byte the server sends at each phase.
 * Usage: node scripts/probe.mjs   (reads DATABASE_URL from .env)
 */
import net from "node:net";
import tls from "node:tls";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDatabaseUrl } from "./pg-lite.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let url = process.env.DATABASE_URL;
if (!url) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.*)\s*$/.exec(line);
    if (m) { url = m[1].replace(/^["']|["']$/g, ""); break; }
  }
}
if (!url) { console.error("no DATABASE_URL"); process.exit(1); }

const cfg = parseDatabaseUrl(url);
console.log(`target ${cfg.host}:${cfg.port} db=${cfg.database} user=${cfg.user} (password hidden)`);

function startupMessage(user, database) {
  const params = Buffer.from(`user\0${user}\0database\0${database}\0\0`, "utf8");
  const head = Buffer.alloc(8);
  head.writeInt32BE(8 + params.length, 0);
  head.writeInt32BE(196608, 4);
  return Buffer.concat([head, params]);
}

function dump(tag, d) {
  console.log(`  [${tag}] ← ${d.length}B  hex=${d.subarray(0, 48).toString("hex")}  ascii=${JSON.stringify(d.toString("utf8").replace(/[^\x20-\x7e]/g, ".").slice(0, 80))}`);
}

async function tryOnce(useTls) {
  console.log(`\n=== trying ${useTls ? "WITH TLS (sslmode=require)" : "PLAINTEXT (sslmode=disable)"} ===`);
  await new Promise((resolve) => {
    const plain = net.connect({ host: cfg.host, port: cfg.port });
    const finish = (msg) => {
      console.log(`RESULT[${useTls ? "tls" : "plain"}]: ${msg}`);
      try { plain.destroy(); } catch {}
      resolve();
    };
    plain.setTimeout(12_000, () => finish("timeout waiting for server"));
    plain.on("error", (e) => finish(`socket error: ${e.message}`));
    plain.on("connect", () => {
      console.log("  tcp connected");
      if (!useTls) {
        plain.on("data", (d) => dump("plain", d));
        plain.write(startupMessage(cfg.user, cfg.database));
        console.log("  → startup message sent (plaintext)");
        setTimeout(() => finish("done (see dumps above)"), 8000);
        return;
      }
      const req = Buffer.alloc(8);
      req.writeInt32BE(8, 0);
      req.writeInt32BE(80877103, 4);
      plain.write(req);
      plain.once("data", (d) => {
        dump("sslreq-reply", d);
        if (d[0] !== 0x53) return finish("server refused TLS");
        const sock = tls.connect(
          { socket: plain, servername: cfg.host, rejectUnauthorized: false },
          () => {
            console.log(`  tls established (${sock.getProtocol()}, cipher=${sock.getCipher()?.name})`);
            sock.on("data", (d2) => dump("post-startup", d2));
            sock.write(startupMessage(cfg.user, cfg.database));
            console.log("  → startup message sent (inside TLS)");
            setTimeout(() => finish("done (see dumps above)"), 8000);
          },
        );
        sock.on("error", (e) => finish(`tls error: ${e.message}`));
      });
    });
  });
}

await tryOnce(true);
await tryOnce(false);
console.log("\nInterpretation:");
console.log("· post-startup dumps show bytes → copy them back to me; auth is working, likely a client parsing issue");
console.log("· tls mode silent + plain mode gets an ErrorResponse → TLS-layer interference; we adapt");
console.log("· BOTH silent → middlebox/security software is filtering port 5432 payloads");
process.exit(0);
