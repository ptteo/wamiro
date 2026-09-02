// Test the AI endpoint end-to-end via the running server
const BASE = "http://127.0.0.1:3000";

async function main() {
  const ts = Date.now();
  const email = `ai-e2e-${ts}@wamiro.test`;
  const password = "Smoke-Test-Pass!";
  // 1) Register
  const reg = await fetch(`${BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      companyName: `AI E2E ${ts}`,
      adminName: "AI E2E",
    }),
  });
  if (!reg.ok) {
    console.log("register failed:", reg.status, await reg.text());
    return;
  }
  const cookie = reg.headers.get("set-cookie")?.split(";")[0] ?? "";
  console.log("registered, cookie:", !!cookie);

  // 2) Send a chat message
  const t0 = Date.now();
  const chat = await fetch(`${BASE}/api/v1/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      messages: [{ role: "user", content: "What is 2+2? Answer in one short sentence." }],
    }),
  });
  console.log("status:", chat.status, "ms:", Date.now() - t0);
  console.log("content-type:", chat.headers.get("content-type"));
  console.log("X-Conversation-Id:", chat.headers.get("x-conversation-id"));
  if (!chat.ok) {
    console.log("error:", (await chat.text()).slice(0, 500));
    return;
  }
  // 3) Parse NDJSON streaming response
  const text = await chat.text();
  const lines = text.split("\n").filter(Boolean);
  console.log("chunks:", lines.length);
  let answer = "";
  for (const line of lines) {
    try {
      const chunk = JSON.parse(line);
      if (chunk.type === "token") {
        answer += chunk.content;
        process.stdout.write(chunk.content);
      } else if (chunk.type === "done") {
        console.log("\n--- done ---");
        console.log("providerMs:", chunk.providerMs);
        console.log("toolCalls:", chunk.toolCalls);
        console.log("mode:", chunk.mode);
        console.log("redactionCount:", chunk.redaction?.redactionCount);
      } else if (chunk.type === "tool_start") {
        console.log("\n[tool_start]", chunk.name);
      } else if (chunk.type === "tool_end") {
        console.log("[tool_end]", chunk.name, "ok:", chunk.ok, "ms:", chunk.durationMs);
      } else if (chunk.type === "mode") {
        console.log("[mode]", chunk.value);
      } else if (chunk.type === "citations") {
        console.log("[citations]", chunk.list.length);
      }
    } catch {}
  }
  console.log("\nfull answer:", JSON.stringify(answer));
}

main().catch(console.error);
