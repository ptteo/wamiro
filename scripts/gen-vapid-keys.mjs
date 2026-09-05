// Prints a VAPID keypair for web push (RFC 8292).
//   node scripts/gen-vapid-keys.mjs
// Then set in .env:
//   VAPID_PUBLIC_KEY=<the base64url public key>
//   VAPID_PRIVATE_KEY="<the PEM, on one line with \n escapes>"
//   VAPID_SUBJECT=mailto:you@company.com
import { generateKeyPairSync, createPublicKey } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

// Public key in the compact base64url (uncompressed 0x04||x||y) form that
// browsers expect in `applicationServerKey`.
const jwk = publicKey.export({ format: "jwk" });
const x = Buffer.from(jwk.x, "base64url");
const y = Buffer.from(jwk.y, "base64url");
const raw = Buffer.concat([Buffer.from([0x04]), x, y]);
const publicB64url = raw.toString("base64url");

const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim();
// Single-line PEM for dotenv files.
const oneLine = privatePem.replace(/\n/g, "\\n");

console.log("VAPID_PUBLIC_KEY=" + publicB64url);
console.log('VAPID_PRIVATE_KEY="' + oneLine + '"');
console.log("VAPID_SUBJECT=mailto:you@your-company.com");
