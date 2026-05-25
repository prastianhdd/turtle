// Router agent — klasifikasi intent user → routing ke agent yang tepat.
// Output: JSON kecil. Pakai temperature rendah biar deterministik.

import { complete } from '../llm.js';

export const ROUTER_SYSTEM = `You are an intent router for an academic AI assistant. Your job: classify a user's message into ONE of these intents:

- "research"     → user wants literature review, deep research, explanation of an academic topic
- "summarize"   → user wants to summarize a document or attached text
- "paraphrase"  → user wants to rewrite/rephrase text (anti-plagiarism, change tone, simplify)
- "chat"        → general conversation, follow-up question, small talk, clarification

You MUST respond with ONLY a JSON object, no prose, no markdown fences. Schema:
{
  "intent": "research" | "summarize" | "paraphrase" | "chat",
  "confidence": 0.0-1.0,
  "reason": "one short sentence in Indonesian"
}

Heuristics:
- If user attached a document AND asks to summarize → "summarize"
- If user attached a document AND asks to rewrite/paraphrase → "paraphrase"
- If user asks "jelaskan", "apa itu", "bagaimana", "buatkan kajian/literatur" → "research"
- If user asks "tulis ulang", "parafrase", "ubah gaya bahasa" → "paraphrase"
- Follow-up questions in an existing conversation usually → "chat"
- When unsure between research and chat, prefer "chat" if conversation has prior turns.`;

export async function routeIntent({ userMessage, hasDocument, historyLength }) {
  const meta = `\n\nContext:\n- has_document: ${hasDocument}\n- prior_turns: ${historyLength}`;

  const raw = await complete(
    [
      { role: 'system', content: ROUTER_SYSTEM },
      { role: 'user', content: userMessage + meta }
    ],
    { temperature: 0.1, maxTokens: 200 }
  );

  // Parse JSON, robust to model wrapping it in code fences
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return fallback(userMessage, hasDocument);

  try {
    const parsed = JSON.parse(match[0]);
    if (!['research', 'summarize', 'paraphrase', 'chat'].includes(parsed.intent)) {
      return fallback(userMessage, hasDocument);
    }
    return {
      intent: parsed.intent,
      confidence: Number(parsed.confidence) || 0.5,
      reason: parsed.reason || ''
    };
  } catch {
    return fallback(userMessage, hasDocument);
  }
}

// Heuristic fallback kalau model gagal balik JSON valid.
function fallback(msg, hasDocument) {
  const lower = msg.toLowerCase();
  if (hasDocument) {
    if (/parafrase|tulis ulang|rewrite/i.test(lower)) {
      return { intent: 'paraphrase', confidence: 0.5, reason: 'fallback: doc + paraphrase keyword' };
    }
    return { intent: 'summarize', confidence: 0.5, reason: 'fallback: dokumen terlampir' };
  }
  if (/parafrase|tulis ulang|rewrite|rephrase/i.test(lower)) {
    return { intent: 'paraphrase', confidence: 0.5, reason: 'fallback: keyword paraphrase' };
  }
  if (/jelaskan|apa itu|kajian|literatur|tinjauan|riset/i.test(lower)) {
    return { intent: 'research', confidence: 0.5, reason: 'fallback: keyword research' };
  }
  return { intent: 'chat', confidence: 0.5, reason: 'fallback: default chat' };
}
