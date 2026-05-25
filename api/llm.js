// Shared LLM client (Ollama/Kiro endpoint, OpenAI-compatible).
// Mendukung: complete, streamComplete, dan toolLoop (multi-step tool use).

const DEFAULT_BASE_URL = 'https://ollama.com/v1';
const DEFAULT_MODEL_FALLBACK = 'gpt-oss:120b-cloud';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const MAX_TOOL_ITERATIONS = 6; // batasi ping-pong agar tidak loop

function getEnv() {
  return {
    apiKey: process.env.OLLAMA_API_KEY || '',
    baseUrl: process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL,
    defaultModel: process.env.OLLAMA_MODEL || DEFAULT_MODEL_FALLBACK
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callOllama(body) {
  const { apiKey, baseUrl } = getEnv();
  if (!apiKey) throw new Error('OLLAMA_API_KEY not configured');

  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (res.ok) return res;

    if (res.status === 429 || res.status === 503) {
      const text = await res.text().catch(() => '');
      lastErr = new Error(`LLM ${res.status}: ${text.slice(0, 200)}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw lastErr;
    }

    const text = await res.text().catch(() => '');
    throw new Error(`LLM ${res.status}: ${text.slice(0, 200)}`);
  }

  throw lastErr || new Error('LLM request failed');
}

export async function complete(messages, { model, temperature = 0.2, maxTokens = 512 } = {}) {
  const { defaultModel } = getEnv();
  const res = await callOllama({
    model: model || defaultModel,
    messages,
    stream: false,
    temperature,
    max_tokens: maxTokens
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function streamComplete(messages, onChunk, { model, temperature = 0.4 } = {}) {
  const { defaultModel } = getEnv();
  const res = await callOllama({
    model: model || defaultModel,
    messages,
    stream: true,
    temperature
  });

  return await consumeSSE(res, onChunk);
}

async function consumeSSE(res, onChunk) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const chunk = parsed.choices?.[0]?.delta?.content;
        if (chunk) {
          accumulated += chunk;
          onChunk(chunk);
        }
      } catch {
        // skip
      }
    }
  }
  return accumulated;
}

/**
 * Tool-use loop. Multi-step:
 *   1. Kirim messages + tools schema.
 *   2. Kalau model balas tool_calls, eksekusi semuanya.
 *   3. Tambah tool results ke messages, ulang sampai model balas teks final.
 *   4. Stream balasan teks final ke onChunk.
 *
 * @param {object[]} initialMessages
 * @param {object[]} tools - OpenAI tool schema
 * @param {function} executeTool - async (name, args) => result
 * @param {object} hooks - { onToolCall, onToolResult, onChunk } untuk SSE forwarding
 * @param {object} opts - { model, temperature, maxIterations }
 * @returns {string} final assistant content
 */
export async function toolLoop(
  initialMessages,
  tools,
  executeTool,
  hooks = {},
  { model, temperature = 0.4, maxIterations = MAX_TOOL_ITERATIONS, ctx = {} } = {}
) {
  const { defaultModel } = getEnv();
  const onChunk = hooks.onChunk || (() => {});
  const onToolCall = hooks.onToolCall || (() => {});
  const onToolResult = hooks.onToolResult || (() => {});

  let messages = [...initialMessages];

  for (let iter = 0; iter < maxIterations; iter++) {
    // Step 1: non-stream call dengan tools — cek apakah model mau panggil tool
    const probeRes = await callOllama({
      model: model || defaultModel,
      messages,
      tools,
      tool_choice: 'auto',
      stream: false,
      temperature
    });
    const probeData = await probeRes.json();
    const choice = probeData.choices?.[0];
    const msg = choice?.message;

    if (!msg) {
      throw new Error('LLM returned no message');
    }

    const toolCalls = msg.tool_calls || [];

    // Tidak ada tool_call → ini final answer. Stream-kan.
    if (toolCalls.length === 0) {
      const finalText = msg.content || '';
      // Stream chunk artificial supaya frontend tetap incremental UX
      // (alternatif: kirim sekaligus). Pisah per kata kasar.
      if (finalText) {
        // Re-stream benar via API agar UX sama:
        const streamRes = await callOllama({
          model: model || defaultModel,
          messages,
          stream: true,
          temperature
        });
        return await consumeSSE(streamRes, onChunk);
      }
      return finalText;
    }

    // Tambah assistant turn ke history
    messages.push({
      role: 'assistant',
      content: msg.content || '',
      tool_calls: toolCalls
    });

    // Step 2: eksekusi semua tool_calls (parallel)
    const results = await Promise.all(toolCalls.map(async (call) => {
      const fn = call.function?.name;
      let args = {};
      try {
        args = call.function?.arguments
          ? JSON.parse(call.function.arguments)
          : {};
      } catch {
        args = {};
      }
      onToolCall({ id: call.id, name: fn, args });

      let result;
      try {
        result = await executeTool(fn, args, ctx);
        onToolResult({ id: call.id, name: fn, ok: true, result });
      } catch (err) {
        result = { error: err.message };
        onToolResult({ id: call.id, name: fn, ok: false, error: err.message });
      }
      return {
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 8000) // cap ukuran
      };
    }));

    messages.push(...results);
    // Loop ulang — model mungkin mau panggil tool lagi atau jawab final.
  }

  // Hit max iterations — paksa final answer tanpa tools
  const finalRes = await callOllama({
    model: model || defaultModel,
    messages: [
      ...messages,
      { role: 'user', content: 'Berdasarkan semua hasil tool di atas, berikan jawaban akhir lengkap sekarang dalam bahasa Indonesia, tanpa memanggil tool lagi.' }
    ],
    stream: true,
    temperature
  });
  return await consumeSSE(finalRes, onChunk);
}

export function getConfig() {
  const { apiKey, baseUrl, defaultModel } = getEnv();
  return { defaultModel, baseUrl, hasKey: Boolean(apiKey) };
}
