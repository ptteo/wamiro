// Quick probe: login then call /api/v1/ai/chat a few times.
const base = "http://127.0.0.1:3000";

async function call(path, init = {}) {
  const r = await fetch(base + path, init);
  const text = await r.text();
  return { status: r.status, body: text };
}

const login = await call("/api/v1/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "admin@wamiro.test", password: "Admin123!" }),
});
if (login.status !== 200) {
  console.log("LOGIN", login.status, login.body.slice(0, 200));
  process.exit(1);
}
const sessionId = JSON.parse(login.body).sessionId;
console.log("session", sessionId.slice(0, 12) + "…");

for (let i = 0; i < 4; i++) {
  const r = await call("/api/v1/ai/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-organization-id": "1",
      "x-session": sessionId,
    },
    body: JSON.stringify({ message: "hello there", history: [] }),
  });
  console.log("try", i, "status", r.status, r.body.slice(0, 220));
  if (r.status === 200) break;
  await new Promise((res) => setTimeout(res, 1500));
}
