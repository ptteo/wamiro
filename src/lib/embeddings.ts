/**
 * Embeddings via the same OpenAI-compatible provider as the chat assistant
 * (AI_BASE_URL / AI_API_KEY + AI_EMBED_MODEL, default text-embedding-3-small,
 * 1536 dimensions — matching the DB column).
 * Unconfigured or failing → null; callers fall back to keyword search.
 */
const DIMENSIONS = 1536;

export function embeddingsConfigured(): boolean {
  return !!(process.env.AI_API_KEY && process.env.AI_EMBED_MODEL);
}

export async function embedText(text: string): Promise<number[] | null> {
  const baseUrl = process.env.AI_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_EMBED_MODEL;
  if (!baseUrl || !apiKey || !model) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: text.slice(0, 8000) }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { embedding?: number[] }[] };
    const embedding = data.data?.[0]?.embedding;
    if (!embedding || embedding.length !== DIMENSIONS) return null;
    return embedding;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
