// Chat completion entrypoint — delegasi ke orchestrator.

import { runOrchestrator } from './orchestrator.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { chatId, userMessage, mode = 'auto', documentId, imageId } = req.body || {};
  const userId = req.userId || null;

  if (!chatId || typeof userMessage !== 'string' || !userMessage.trim()) {
    return res.status(400).json({ error: 'chatId and non-empty userMessage are required' });
  }

  await runOrchestrator({ chatId, userMessage: userMessage.trim(), mode, documentId, imageId, userId }, res);
}
