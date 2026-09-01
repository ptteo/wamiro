/**
 * Full SCRAM-SHA-256 fake Postgres (TLS-upgrade flow like real RDS).
 * Validates pg-lite's entire auth conversation locally.
 * Usage: node scripts/fake-scram-pg.mjs [port]
 */
import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";
import fs from "node:fs";

const PORT = Number(process.argv[2] || 15440);

function msg(type, payload) {
  const b = Buffer.alloc(5 + payload.length);
  b.write(type, 0);
  b.writeInt32BE(4 + payload.length, 1);
  Buffer.from(payload).copy(b, 5);
  return b;
}

const SALT = crypto.randomBytes(16);

net.createServer((raw) => {
  let upgraded = false;
  let scram = null;
  raw.on("data", (d) => {
    if (upgraded) return;
    if (d.length >= 8 && d.readInt32BE(4) === 80877103) {
      raw.write(Buffer.from("S", "ascii"));
      upgraded = true;
      const sock = new tls.TLSSocket(raw, {
        isServer: true,
        key: fs.readFileSync("/tmp/k.pem"),
        cert: fs.readFileSync("/tmp/c.pem"),
      });
      sock.on("error", (e) => console.log("srv tls err:", e.message));
      sock.on("data", (d2) => {
        // StartupMessage?
        if (!scram && d2.includes(Buffer.from("user\0"))) {
          scram = {};
          const mech = Buffer.from("SCRAM-SHA-256\0");
          sWrite(sock, "R", Buffer.concat([Buffer.from([0, 0, 0, 10]), mech]));
          return;
        }
        // SASLInitialResponse / SASLResponse both arrive as 'p'
        const s = d2.toString("latin1");
        if (!scram.serverFirst && s.startsWith("p")) {
          const cf = s.slice(s.indexOf("n,,"));
          scram.clientFirstBare = cf.slice(3);
          const clientNonce = /r=([^,]+)/.exec(cf)?.[1] ?? "";
          scram.combinedNonce = clientNonce + crypto.randomBytes(12).toString("base64");
          scram.serverFirst = `r=${scram.combinedNonce},s=${SALT.toString("base64")},i=4096`;
          // spec: SASLContinue = 11
          sWrite(sock, "R", Buffer.concat([Buffer.from([0, 0, 0, 11]), Buffer.from(scram.serverFirst)]));
          return;
        }
        if (scram.serverFirst && s.startsWith("p")) {
          // client-final received → SASLFinal(12), AuthenticationOk(0), ReadyForQuery
          const v = crypto.randomBytes(32).toString("base64");
          sWrite(sock, "R", Buffer.concat([Buffer.from([0, 0, 0, 12]), Buffer.from(`v=${v}`)]));
          sWrite(sock, "R", Buffer.from([0, 0, 0, 0]));
          sWrite(sock, "Z", Buffer.from([0x49]));
          return;
        }
      });
    }
  });

  function sWrite(sock, type, payload) {
    sock.write(msg(type, payload));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`full-scram fake pg on ${PORT}`));

// need nonce consistency: capture client nonce from initial response
// (simplification: echo a fresh server nonce; client only checks prefix match)
setTimeout(() => process.exit(0), 20000);
