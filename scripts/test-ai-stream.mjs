// Test AI streaming
const BASE = "https://router.bynara.id/v1";
const KEY = "sk-nry-gxI1Sd5nvXV5Ul0aRoDCoLAaWnSTtdCecl_FM1IUmtY";
const MODEL = "minimax-m3-free";

async function main() {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: "What is 2+2? Answer in one word." }],
      temperature: 0.2,
      max_tokens: 50,
      stream: true,
    }),
  });
  console.log("status:", res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
    for (const line of lines) {
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        const d = j.choices?.[0]?.delta?.content;
        if (d) total += d;
      } catch {}
    }
  }
  console.log("ms:", Date.now() - t0, "answer:", total);
}

main().catch(console.error);
