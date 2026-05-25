import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import chatHandler from './api/chat.js';
import {
  handleGoogleStart,
  handleGoogleCallback,
  handleAuthStatus,
  handleLogout,
  handleMe,
  requireAuth
} from './api/auth.js';
import {
  uploadMiddleware,
  handleUpload,
  handleGetDocument,
  handleListDocuments,
  handleDeleteDocument,
  imageUploadMiddleware,
  handleImageUpload,
  handleGetImage,
  handleDeleteImage
} from './api/upload.js';
import {
  listChatsWithMessages,
  getChat,
  createChat,
  updateChat,
  deleteChat,
  deleteMessage,
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  listChatsByProject,
  setChatProject,
  listDocumentsByProject,
  listMemories,
  deleteMemory
} from './api/db.js';

const app = express();
const port = Number(process.env.PORT) || 3000;
const SITE_URL = process.env.SITE_URL || 'http://localhost:5173';
const ALLOWED_ORIGINS = SITE_URL.split(',').map(s => s.trim()).filter(Boolean);
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const ORIGINS = Array.from(new Set([...ALLOWED_ORIGINS, ...DEV_ORIGINS]));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked: ${origin}`));
  }
}));

app.use(express.json({ limit: '10mb' }));

// === Public auth routes ===
app.get('/api/auth/google', handleGoogleStart);
app.get('/api/auth/google/callback', handleGoogleCallback);
app.get('/api/auth/status', handleAuthStatus);
app.get('/api/auth/me', handleMe);
app.post('/api/auth/logout', handleLogout);

// === Auth gate untuk semua /api/* lainnya ===
app.use(requireAuth);

// === Rate limit ===
// Global Kiro rate limit — share quota antar semua user. 60 req/menit total.
const llmGlobalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: () => 'global', // share key = global limit
  message: { error: 'Server sedang sibuk. Tunggu beberapa detik.' }
});

// Per-user fallback (anti satu user spam habis quota orang lain)
const llmPerUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip,
  message: { error: 'Terlalu banyak request dari Anda. Tunggu sebentar.' }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip
});

// === Chats CRUD ===
app.get('/api/chats', async (req, res) => {
  try {
    res.json(await listChatsWithMessages(req.userId));
  } catch (err) {
    console.error('[GET /api/chats]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chats/:id', async (req, res) => {
  const chat = await getChat(req.params.id, req.userId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  res.json(chat);
});

app.post('/api/chats', async (req, res) => {
  try {
    const { mode = 'auto', title } = req.body || {};
    const chat = await createChat({ mode, title, userId: req.userId });
    res.status(201).json(chat);
  } catch (err) {
    console.error('[POST /api/chats]', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/chats/:id', async (req, res) => {
  const updated = await updateChat(req.params.id, req.body || {}, req.userId);
  if (!updated) return res.status(404).json({ error: 'Chat not found' });
  res.json(updated);
});

app.delete('/api/chats/:id', async (req, res) => {
  const ok = await deleteChat(req.params.id, req.userId);
  if (!ok) return res.status(404).json({ error: 'Chat not found' });
  res.status(204).end();
});

app.delete('/api/messages/:id', async (req, res) => {
  const ok = await deleteMessage(req.params.id, req.userId);
  if (!ok) return res.status(404).json({ error: 'Message not found' });
  res.status(204).end();
});

// === Documents ===
app.post('/api/upload', uploadLimiter, uploadMiddleware, handleUpload);
app.get('/api/documents', handleListDocuments);
app.get('/api/documents/:id', handleGetDocument);
app.delete('/api/documents/:id', handleDeleteDocument);

// === Images ===
app.post('/api/upload-image', uploadLimiter, imageUploadMiddleware, handleImageUpload);
app.get('/api/images/:id', handleGetImage);
app.delete('/api/images/:id', handleDeleteImage);

// === Projects ===
app.get('/api/projects', async (req, res) => res.json(await listProjects(req.userId)));

app.get('/api/projects/:id', async (req, res) => {
  const p = await getProject(req.params.id, req.userId);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const chats = await listChatsByProject(p.id, req.userId);
  const documents = await listDocumentsByProject(p.id, req.userId);
  res.json({ ...p, chats, documents });
});

app.post('/api/projects', async (req, res) => {
  const { name, description } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  res.status(201).json(await createProject({
    name: name.trim(),
    description: description || '',
    userId: req.userId
  }));
});

app.patch('/api/projects/:id', async (req, res) => {
  const updated = await updateProject(req.params.id, req.body || {}, req.userId);
  if (!updated) return res.status(404).json({ error: 'Project not found' });
  res.json(updated);
});

app.delete('/api/projects/:id', async (req, res) => {
  const ok = await deleteProject(req.params.id, req.userId);
  if (!ok) return res.status(404).json({ error: 'Project not found' });
  res.status(204).end();
});

app.post('/api/chats/:id/project', async (req, res) => {
  const { projectId } = req.body || {};
  await setChatProject(req.params.id, projectId || null, req.userId);
  res.status(204).end();
});

// === Memories ===
app.get('/api/memories', async (req, res) => res.json(await listMemories(req.userId)));
app.delete('/api/memories/:id', async (req, res) => {
  const ok = await deleteMemory(req.params.id, req.userId);
  if (!ok) return res.status(404).json({ error: 'Memory not found' });
  res.status(204).end();
});

// === Chat completion (streaming) — global + per-user limit ===
app.post('/api/chat', llmGlobalLimiter, llmPerUserLimiter, async (req, res) => {
  try {
    await chatHandler(req, res);
  } catch (err) {
    console.error('[POST /api/chat]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: process.env.OLLAMA_MODEL || 'gpt-oss:120b-cloud',
    hasKey: Boolean(process.env.OLLAMA_API_KEY),
    googleOAuth: Boolean(process.env.GOOGLE_CLIENT_ID)
  });
});

// === Static SPA (production) ===
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, 'dist');
  app.use(express.static(distDir, { maxAge: '1d', index: false }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Turtle ${process.env.NODE_ENV === 'production' ? 'PROD' : 'DEV'} listening on http://localhost:${port}`);
  console.log(`   CORS allowed origins: ${ORIGINS.join(', ')}`);
  if (!process.env.OLLAMA_API_KEY) console.warn('   ! OLLAMA_API_KEY belum di-set');
  if (!process.env.GOOGLE_CLIENT_ID) console.warn('   ! GOOGLE_CLIENT_ID belum di-set (auth disabled)');
  if (!process.env.AUTH_SECRET) console.warn('   ! AUTH_SECRET belum di-set (pakai fallback dev secret)');
  console.log(`   model: ${process.env.OLLAMA_MODEL || 'gpt-oss:120b-cloud'}`);
});
