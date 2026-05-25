// Embedding client — pakai endpoint OpenAI-compatible /v1/embeddings di Kiro / Ollama / OpenRouter.
// Default model bge-m3 (1024 dim). Override via env EMBED_MODEL.

const DEFAULT_MODEL = 'bge-m3';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const BATCH_SIZE = 32; // batch input untuk efisiensi

function getEnv() {
  return {
    apiKey: process.env.OLLAMA_API_KEY || '',
    baseUrl: process.env.OLLAMA_BASE_URL || 'https://ollama.com/v1',
    model: process.env.EMBED_MODEL || DEFAULT_MODEL
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callEmbed(input, model) {
  const { apiKey, baseUrl } = getEnv();
  if (!apiKey) throw new Error('OLLAMA_API_KEY not configured');

  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, input })
    });

    if (res.ok) return res.json();

    if (res.status === 429 || res.status === 503) {
      lastErr = new Error(`Embed ${res.status}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw lastErr;
    }

    const txt = await res.text().catch(() => '');
    throw new Error(`Embed ${res.status}: ${txt.slice(0, 200)}`);
  }
  throw lastErr || new Error('Embed request failed');
}

/**
 * Embed satu teks. Returns Float32Array.
 */
export async function embed(text) {
  const { model } = getEnv();
  const data = await callEmbed(text, model);
  const vec = data.data?.[0]?.embedding;
  if (!vec || !Array.isArray(vec)) {
    throw new Error('Embed: empty response');
  }
  return new Float32Array(vec);
}

/**
 * Embed banyak teks (batch). Returns Float32Array[].
 */
export async function embedMany(texts) {
  if (!texts || texts.length === 0) return [];
  const { model } = getEnv();
  const out = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const data = await callEmbed(batch, model);
    const vecs = (data.data || []).map(d => new Float32Array(d.embedding));
    if (vecs.length !== batch.length) {
      throw new Error(`Embed batch mismatch: expected ${batch.length}, got ${vecs.length}`);
    }
    out.push(...vecs);
  }
  return out;
}
