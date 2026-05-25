// Orchestrator: route → pilih agent → tool loop → stream balasan ke client (SSE).

import { streamComplete, toolLoop } from './llm.js';
import { addMessage, updateMessage, getChat, updateChat, getDocument, getImage } from './db.js';
import { CHAT } from './agents/chat.js';
import { LITERATURE_REVIEWER } from './agents/literature-reviewer.js';
import { SUMMARIZER } from './agents/summarizer.js';
import { PARAPHRASER } from './agents/paraphraser.js';
import { TOOL_SCHEMAS, executeTool } from './tools.js';

const MAX_DOC_CHARS = 60_000;
const MAX_HISTORY_MESSAGES = 30;

function trimDocText(text) {
  if (!text) return '';
  if (text.length <= MAX_DOC_CHARS) return text;
  const head = text.slice(0, MAX_DOC_CHARS * 0.7);
  const tail = text.slice(-MAX_DOC_CHARS * 0.3);
  return `${head}\n\n[...bagian tengah dipotong karena dokumen panjang...]\n\n${tail}`;
}

function buildHistory(chat) {
  return chat.messages
    .filter(m => m.content && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map(m => ({ role: m.role, content: m.content }));
}

function pickAgent(intent) {
  switch (intent) {
    case 'research':   return LITERATURE_REVIEWER;
    case 'summarize':  return SUMMARIZER;
    case 'paraphrase': return PARAPHRASER;
    case 'chat':
    default:           return CHAT;
  }
}

// Filter tool schemas berdasarkan whitelist dari agent (opsional).
function pickTools(allowList) {
  if (!allowList || allowList.length === 0) return null;
  return TOOL_SCHEMAS.filter(t => allowList.includes(t.function.name));
}

function setupSSE(res) {
  if (res.headersSent) return;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendDone(res) {
  res.write('data: [DONE]\n\n');
  res.end();
}

const TITLE_PLACEHOLDER = 'Percakapan Baru';

export async function runOrchestrator({ chatId, userMessage, mode = 'auto', documentId, imageId }, res) {
  const chat = await getChat(chatId);
  if (!chat) {
    return res.status(404).json({ error: 'Chat not found' });
  }

  const document = documentId ? await getDocument(documentId) : null;
  const hasDocument = Boolean(document);
  const image = imageId ? await getImage(imageId) : null;
  const hasImage = Boolean(image);

  setupSSE(res);

  // === 1. Persist user message ===
  let displayUser = userMessage;
  if (hasDocument) displayUser += `\n\n📎 ${document.filename}`;
  if (hasImage) displayUser += `\n\n🖼 ${image.filename}`;
  const userMsg = await addMessage(chatId, { role: 'user', content: displayUser });

  if (!chat.title || chat.title === TITLE_PLACEHOLDER) {
    const title = userMessage.length > 60 ? userMessage.slice(0, 60) + '…' : userMessage;
    await updateChat(chatId, { title, mode: chat.mode });
  }

  // === 2. Route ===
  // Mode "auto" = chat biasa (tanpa router). Mode eksplisit = agent yg cocok.
  let intent;
  let routerInfo = null;
  const map = {
    auto: 'chat',
    chat: 'chat',
    research: 'research',
    summary: 'summarize',
    paraphrase: 'paraphrase'
  };
  intent = map[mode] || 'chat';

  const agent = pickAgent(intent);
  sse(res, { type: 'agent', intent, agent: agent.name, router: routerInfo });

  // === 3. Build messages ===
  const history = buildHistory(chat);
  let messages;

  if (intent === 'summarize') {
    if (!document) {
      sse(res, { type: 'error', error: 'Mode summarize butuh dokumen terlampir.' });
      return sendDone(res);
    }
    messages = agent.buildMessages({
      documentText: trimDocText(document.text),
      filename: document.filename,
      userInstruction: userMessage,
      history
    });
  } else if (intent === 'paraphrase') {
    const sourceText = document ? trimDocText(document.text) : userMessage;
    messages = agent.buildMessages({
      sourceText,
      instruction: document ? userMessage : null,
      history
    });
  } else if (intent === 'research') {
    messages = agent.buildMessages({ topic: userMessage, history });
  } else {
    const augmented = document
      ? `${userMessage}\n\n[Dokumen lampiran "${document.filename}" tersedia. Konten singkat:\n${document.text.slice(0, 2000)}\n...]`
      : userMessage;
    messages = agent.buildMessages({ userMessage: augmented, history });
  }

  // Inject image ke last user message — multimodal content array
  if (hasImage && messages.length > 0) {
    const lastIdx = messages.length - 1;
    const last = messages[lastIdx];
    if (last.role === 'user' && typeof last.content === 'string') {
      messages[lastIdx] = {
        role: 'user',
        content: [
          { type: 'text', text: last.content },
          { type: 'image_url', image_url: { url: image.dataUrl, detail: 'auto' } }
        ]
      };
    }
  }

  // === 4. Stream / tool loop ===
  const asstMsg = await addMessage(chatId, { role: 'assistant', content: '' });
  sse(res, { type: 'meta', userMessageId: userMsg.id, assistantMessageId: asstMsg.id });

  let accumulated = '';
  try {
    const tools = pickTools(agent.tools);

    if (tools && tools.length > 0) {
      // Tool-use loop dengan SSE forwarding
      await toolLoop(
        messages,
        tools,
        executeTool,
        {
          onChunk: (chunk) => {
            accumulated += chunk;
            sse(res, { type: 'chunk', content: chunk });
          },
          onToolCall: (call) => {
            sse(res, {
              type: 'tool_call',
              id: call.id,
              name: call.name,
              args: call.args
            });
          },
          onToolResult: (r) => {
            sse(res, {
              type: 'tool_result',
              id: r.id,
              name: r.name,
              ok: r.ok,
              error: r.error || null,
              // Cap result preview agar SSE tidak overflow
              preview: r.ok ? truncatePreview(r.result) : null
            });
          }
        },
        { temperature: agent.temperature ?? 0.4 }
      );
    } else {
      // Tanpa tools — stream langsung
      await streamComplete(
        messages,
        (chunk) => {
          accumulated += chunk;
          sse(res, { type: 'chunk', content: chunk });
        },
        { temperature: agent.temperature ?? 0.4 }
      );
    }

    await updateMessage(asstMsg.id, accumulated);
    sse(res, { type: 'done' });
    sendDone(res);
  } catch (err) {
    console.error('[Orchestrator] error:', err.message);
    const errMsg = accumulated
      ? `${accumulated}\n\n[Error] ${err.message}`
      : `[Error] ${err.message}`;
    await updateMessage(asstMsg.id, errMsg);
    sse(res, { type: 'error', error: err.message });
    sendDone(res);
  }
}

function truncatePreview(result) {
  try {
    const str = typeof result === 'string' ? result : JSON.stringify(result);
    return str.length > 600 ? str.slice(0, 600) + '…' : str;
  } catch {
    return null;
  }
}
