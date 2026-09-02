// Test the tools path (workforce query)
const BASE = "http://127.0.0.1:3000";

async function main() {
  const ts = Date.now();
  const email = `ai-tools-${ts}@wamiro.test`;
  const password = "Smoke-Test-Pass!";
  const reg = await fetch(`${BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      companyName: `AI Tools ${ts}`,
      adminName: "AI Tools",
    }),
  });
  if (!reg.ok) {
    console.log("register failed:", reg.status);
    return;
  }
  const cookie = reg.headers.get("set-cookie")?.split(";")[0] ?? "";
  console.log("registered");

  // Ask something that triggers the tools path (workforce)
  const t0 = Date.now();
  const chat = await fetch(`${BASE}/api/v1/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      messages: [
        { role: "user", content: "What's the headcount of my company?" },
      ],
      noTools: false,
    }),
  });
  console.log("status:", chat.status, "ms:", Date.now() - t0);
  if (!chat.ok) {
    console.log("error:", (await chat.text()).slice(0, 1000));
    return;
  }
  const text = await chat.text();
  const lines = text.split("\n").filter(Boolean);
  console.log("chunks:", lines.length);
  let answer = "";
  for (const line of lines) {
    try {
      const chunk = JSON.parse(line);
      if (chunk.type === "token") {
        answer += chunk.content;
      } else if (chunk.type === "done") {
        console.log("providerMs:", chunk.providerMs);
        console.log("toolCalls:", chunk.toolCalls);
        console.log("mode:", chunk.mode);
      } else if (chunk.type === "tool_start") {
        console.log("[tool_start]", chunk.name);
      } else if (chunk.type === "tool_end") {
        console.log("[tool_end]", chunk.name, "ok:", chunk.ok, "ms:", chunk.durationMs);
      } else if (chunk.type === "mode") {
        console.log("[mode]", chunk.value);
      } else if (chunk.type === "citations") {
        console.log("[citations]", chunk.list.length);
      }
    } catch {}
  }
  console.log("answer:", answer);
}

main().catch(console.error);
