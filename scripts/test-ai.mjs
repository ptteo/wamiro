// Quick test of the AI provider
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
    }),
  });
  const ms = Date.now() - t0;
  console.log("status:", res.status, "ms:", ms);
  if (!res.ok) {
    console.log("error:", (await res.text()).slice(0, 500));
    return;
  }
  const data = await res.json();
  console.log("answer:", data.choices?.[0]?.message?.content);
  console.log("usage:", data.usage);
}

main().catch(console.error);
