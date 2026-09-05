// Email-to-ticket worker (F2.2) — polls every enabled mailbox.
//
// Run once:    npm run mail:worker -- --once
// Run forever: npm run mail:worker
//
// Requires `npm i imapflow` only when a mailbox is actually enabled — the
// app itself has no new dependency. Run under systemd/pm2 like the app
// (single instance assumption per ADR notes).
import { pollAllMailboxes } from "../src/modules/mailboxes/service.ts";

const ONCE = process.argv.includes("--once");
const INTERVAL_MS = Number(process.env.MAIL_POLL_INTERVAL_MS ?? 60_000);

async function tick() {
  try {
    const results = await pollAllMailboxes();
    for (const r of results) {
      console.log(
        JSON.stringify({
          level: "info",
          msg: "mail_poll_done",
          mailboxId: r.mailboxId,
          ...r.counts,
        }),
      );
    }
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "mail_worker_tick_failed", err: String(e) }));
  }
}

if (ONCE) {
  await tick();
  process.exit(0);
}

console.log(JSON.stringify({ level: "info", msg: "mail_worker_started", intervalMs: INTERVAL_MS }));
await tick();
setInterval(() => void tick(), INTERVAL_MS);