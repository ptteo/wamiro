/**
 * Minimal PostgreSQL client — zero dependencies (node:net/tls + node:crypto).
 * Supports: SSLRequest → StartupMessage → SCRAM-SHA-256 / cleartext auth →
 * simple query protocol. Enough to run DDL/DML when npm install isn't
 * available. NOT a general-purpose driver; app code uses pg.
 */
import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";

export function parseDatabaseUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    ssl: /[?&]sslmode=require/.test(url),
  };
}

class PgSocket {
  constructor(cfg) {
    this.cfg = cfg;
    this.buf = Buffer.alloc(0);
    this.lastFields = [];
    this.results = [];
    this.rowCount = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const fail = (e) => reject(new Error(`connect failed: ${e.message}`));
      const stage = (s) => this.cfg.onStage?.(s);
      const plain = net.connect({ host: this.cfg.host, port: this.cfg.port });
      this.socket = plain;
      plain.once("error", fail);
      // Silent firewall drops hang forever without this:
      const tcpTimer = setTimeout(() => {
        plain.destroy();
        reject(
          new Error(
            `TCP connect to ${this.cfg.host}:${this.cfg.port} timed out after 10s.\n` +
              `Check, in order:\n` +
              `  1. RDS instance status is "Available" (not creating/modifying)\n` +
              `  2. "Publicly accessible" is YES if you're connecting from your laptop\n` +
              `  3. Security group has inbound rule: TCP 5432 from your current IP`,
          ),
        );
      }, 10_000);

      plain.once("connect", () => {
        clearTimeout(tcpTimer);
        stage("tcp connected");
        if (!this.cfg.ssl) {
          plain.removeListener("error", fail);
          resolve(this.startup(plain, reject));
          return;
        }
        const req = Buffer.alloc(8);
        req.writeInt32BE(8, 0);
        req.writeInt32BE(80877103, 4);
        plain.write(req);
        const tlsTimer = setTimeout(() => {
          plain.destroy();
          reject(new Error("TLS negotiation timed out after 10s"));
        }, 10_000);
        plain.once("data", (d) => {
          clearTimeout(tlsTimer);
          if (d.toString("utf8", 0, 1) !== "S") {
            reject(new Error("server refused TLS but sslmode=require"));
            return;
          }
          const sock = tls.connect(
            { socket: plain, servername: this.cfg.host, rejectUnauthorized: false }, // ponytail: RDS regional CA chain; TLS still on the wire
            () => {
              stage("tls established");
              // attach only after handshake completes — mirrors the proven-working probe path
              this.attachData(sock);
              resolve(this.startup(sock, reject));
            },
          );
          this.socket = sock;
          sock.once("error", fail);
        });
      });
      if (!this.cfg.ssl) this.attachData(plain);
    });
  }

  attachData(sock) {
    sock.on("data", (d) => {
      this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    });
  }

  startup(sock, rejectStartup) {
    return new Promise((resolve, reject) => {
      sock.on("error", (e) => reject(new Error(`socket: ${e.message}`)));
      const authTimer = setTimeout(() => {
        const partial = this.buf.length
          ? ` ${this.buf.length}B of partial data arrived: hex=${this.buf.subarray(0, 48).toString("hex")}`
          : " — zero bytes came back";
        reject(new Error(`no response during authentication (15s)${partial}`));
      }, 15_000);
      const done = () => {
        clearTimeout(authTimer);
        this.cfg.onStage?.("authenticated");
        resolve();
      };
      const params = Buffer.from(`user\0${this.cfg.user}\0database\0${this.cfg.database}\0\0`, "utf8");
      const head = Buffer.alloc(8);
      head.writeInt32BE(8 + params.length, 0);
      head.writeInt32BE(196608, 4);
      this.socket.write(Buffer.concat([head, params]));
      (async () => {
        // startup loop: auth exchange until ReadyForQuery
        try {
          for (;;) {
            const { type, payload } = await this.readMessage();
            if (type === "R") await this.handleAuth(payload);
            else if (type === "E") {
              const err = parseError(payload);
              throw new Error(`${err.S ?? ""}${err.C ?? ""}: ${err.M}`);
            } else if (type === "Z") {
              done();
              return;
            }
          }
        } catch (e) {
          clearTimeout(authTimer);
          rejectStartup(e);
        }
      })();
    });
  }

  async handleAuth(payload) {
    const method = payload.readInt32BE(0);
    // Auth message codes (PG protocol): 0=Ok, 3=Cleartext, 5=MD5,
    // 10=SASL, 11=SASLContinue, 12=SASLFinal
    if (method === 0) return;
    if (method === 3) {
      this.send("p", Buffer.from(this.cfg.password + "\0", "utf8"));
      return;
    }
    if (method === 10) {
      const mechs = payload.subarray(4).toString("utf8").split("\0").filter(Boolean);
      if (!mechs.includes("SCRAM-SHA-256")) {
        throw new Error(`server offered unsupported SASL mechs: ${mechs.join(",")}`);
      }
      this.nonce = crypto.randomBytes(18).toString("base64");
      this.clientFirstBare = `n=,r=${this.nonce}`;
      const resp = `n,,${this.clientFirstBare}`;
      const body = Buffer.concat([
        Buffer.from("SCRAM-SHA-256\0", "utf8"),
        (() => {
          const l = Buffer.alloc(4);
          l.writeInt32BE(resp.length, 0);
          return l;
        })(),
        Buffer.from(resp, "utf8"),
      ]);
      this.send("p", body);
      return;
    }
    if (method === 11) {
      // SASLContinue: server-first-message
      const serverFirst = payload.subarray(4).toString("utf8");
      const kv = Object.fromEntries(serverFirst.split(",").map((p) => [p[0], p.slice(2)]));
      if (!kv.r.startsWith(this.nonce)) throw new Error("SCRAM nonce mismatch (possible MITM)");
      const saltedPassword = crypto.pbkdf2Sync(
        this.cfg.password,
        Buffer.from(kv.s, "base64"),
        parseInt(kv.i, 10),
        32,
        "sha256",
      );
      const clientKey = crypto.createHmac("sha256", saltedPassword).update("Client Key").digest();
      const storedKey = crypto.createHash("sha256").update(clientKey).digest();
      const clientFinalNoProof = `c=biws,r=${kv.r}`;
      const authMessage = `${this.clientFirstBare},${serverFirst},${clientFinalNoProof}`;
      const clientSignature = crypto.createHmac("sha256", storedKey).update(authMessage).digest();
      const proof = Buffer.alloc(clientKey.length);
      for (let i = 0; i < proof.length; i++) proof[i] = clientKey[i] ^ clientSignature[i];
      this.send(
        "p",
        Buffer.from(`${clientFinalNoProof},p=${proof.toString("base64")}`, "utf8"),
      );
      return;
    }
    if (method === 12) {
      // SASLFinal: server signature; TLS already protects the channel
      return;
    }
    if (method === 5) throw new Error("MD5 auth requested — expected SCRAM (RDS default)");
    throw new Error(`unsupported auth method ${method}`);
  }

  send(type, body) {
    const frame = Buffer.alloc(5 + body.length);
    frame.write(type, 0, "ascii");
    frame.writeInt32BE(4 + body.length, 1);
    body.copy(frame, 5);
    this.socket.write(frame);
  }

  async readMessage() {
    while (this.buf.length < 5) await pause();
    const type = String.fromCharCode(this.buf.readUInt8(0));
    const len = this.buf.readInt32BE(1);
    while (this.buf.length < 1 + len) await pause();
    const payload = this.buf.subarray(5, 1 + len);
    this.buf = this.buf.subarray(1 + len);
    return { type, payload };
  }

  async query(sqlText) {
    this.results = [];
    this.rowCount = 0;
    this.send("Q", Buffer.from(sqlText + "\0", "utf8"));
    let fields = [];
    for (;;) {
      const { type, payload } = await this.readMessage();
      if (type === "T") fields = parseRowDescription(payload);
      else if (type === "D") this.results.push(parseRow(payload, fields));
      else if (type === "C") {
        const m = /^(\w+) (\d+)$/.exec(payload.toString("utf8").trim());
        if (m && m[1] !== "INSERT") this.rowCount = Number(m[2]);
        else if (m && m[1] === "INSERT") this.rowCount = Number(m[2]);
      } else if (type === "E") {
        const err = parseError(payload);
        throw new Error(`${err.C}: ${err.M}${err.D ? `\n  ${err.D}` : ""}`);
      } else if (type === "Z") {
        return { rows: this.results, rowCount: this.rowCount };
      }
    }
  }

  end() {
    try {
      this.send("X", Buffer.alloc(0));
      this.socket.end();
    } catch {
      /* best effort */
    }
  }
}

const pause = () => new Promise((r) => setTimeout(r, 2));

function parseRowDescription(p) {
  const fields = [];
  let o = 2;
  const n = p.readInt16BE(0);
  for (let i = 0; i < n; i++) {
    let e = o;
    while (p[e] !== 0) e++;
    fields.push(p.toString("utf8", o, e));
    o = e + 19; // null byte + 18 bytes of field metadata
  }
  return fields;
}

function parseRow(p, fields) {
  const row = {};
  let o = 2;
  const n = p.readInt16BE(0);
  for (let i = 0; i < n; i++) {
    const len = p.readInt32BE(o);
    o += 4;
    if (len === -1) row[fields[i]] = null;
    else {
      row[fields[i]] = p.toString("utf8", o, o + len);
      o += len;
    }
  }
  return row;
}

function parseError(p) {
  const err = {};
  let o = 0;
  while (o < p.length && p[o] !== 0) {
    const code = String.fromCharCode(p[o]);
    let e = ++o;
    while (p[e] !== 0) e++;
    err[code] = p.toString("utf8", o, e);
    o = e + 1;
  }
  return err;
}

export async function connect(url, onStage) {
  const cfg = typeof url === "string" ? parseDatabaseUrl(url) : url;
  if (onStage) cfg.onStage = onStage;
  const sock = new PgSocket(cfg);
  await sock.connect();
  return sock;
}
