// Postgres (Neon) storage layer + pgvector. Semua API async.
//
// Schema migrasi otomatis di startup. Idempotent (CREATE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS).

import pg from 'pg';
import { nanoid } from 'nanoid';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set. Get one at https://neon.tech');
}

const EMBED_DIM = Number(process.env.EMBED_DIM) || 1024;

// Pool dengan SSL untuk Neon (mereka pakai self-signed CA chain).
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000
});

pool.on('error', (err) => {
  console.error('[pg pool] idle client error:', err.message);
});

async function q(text, params = []) {
  const res = await pool.query(text, params);
  return res;
}

// === Schema migration ===
async function init() {
  await q(`CREATE EXTENSION IF NOT EXISTS vector`);

  // Users (parent dari semua data)
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      name        TEXT,
      picture     TEXT,
      google_sub  TEXT UNIQUE,
      created_at  BIGINT NOT NULL,
      last_login  BIGINT
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS chats (
      id          TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL DEFAULT 'Percakapan Baru',
      mode        TEXT NOT NULL DEFAULT 'auto',
      project_id  TEXT,
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role        TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
      content     TEXT NOT NULL,
      created_at  BIGINT NOT NULL
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS documents (
      id          TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
      chat_id     TEXT REFERENCES chats(id) ON DELETE SET NULL,
      filename    TEXT NOT NULL,
      mime_type   TEXT,
      char_count  INTEGER NOT NULL DEFAULT 0,
      text        TEXT NOT NULL,
      created_at  BIGINT NOT NULL
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id           BIGSERIAL PRIMARY KEY,
      document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index  INTEGER NOT NULL,
      text         TEXT NOT NULL,
      char_start   INTEGER,
      char_end     INTEGER,
      embedding    vector(${EMBED_DIM})
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS images (
      id          TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
      chat_id     TEXT REFERENCES chats(id) ON DELETE SET NULL,
      filename    TEXT NOT NULL,
      mime_type   TEXT NOT NULL,
      file_path   TEXT,
      created_at  BIGINT NOT NULL
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS memories (
      id          TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
      content     TEXT NOT NULL,
      tags        TEXT,
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      created_at  BIGINT NOT NULL
    )
  `);

  // Migrasi additive untuk DB lama: tambah kolom user_id kalau belum ada
  await q(`ALTER TABLE chats     ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await q(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await q(`ALTER TABLE images    ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await q(`ALTER TABLE memories  ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await q(`ALTER TABLE projects  ADD COLUMN IF NOT EXISTS user_id TEXT`);
  // Migrasi: drop kolom lama data_url di images (kalau exist), pindah ke file_path
  await q(`ALTER TABLE images    ADD COLUMN IF NOT EXISTS file_path TEXT`);
  await q(`ALTER TABLE images    DROP COLUMN IF EXISTS data_url`);

  await q(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_documents_chat_id ON documents(chat_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)`);
  await q(`
    CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON document_chunks USING hnsw (embedding vector_cosine_ops)
  `);
}

let initPromise = null;
export function ensureInit() {
  if (!initPromise) initPromise = init().catch((err) => {
    console.error('[db init] failed:', err.message);
    initPromise = null;
    throw err;
  });
  return initPromise;
}

if (DATABASE_URL) ensureInit();

// === Users ===
export async function upsertUserByGoogle({ googleSub, email, name = null, picture = null }) {
  await ensureInit();
  const now = Date.now();
  // Try update existing
  const existing = (await q(
    `SELECT id FROM users WHERE google_sub = $1 OR email = $2`,
    [googleSub, email]
  )).rows[0];

  if (existing) {
    await q(
      `UPDATE users SET email = $1, name = $2, picture = $3, google_sub = $4, last_login = $5
       WHERE id = $6`,
      [email, name, picture, googleSub, now, existing.id]
    );
    return getUserById(existing.id);
  }

  const id = `usr-${nanoid(10)}`;
  await q(
    `INSERT INTO users (id, email, name, picture, google_sub, created_at, last_login)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    [id, email, name, picture, googleSub, now]
  );
  return getUserById(id);
}

export async function getUserById(id) {
  await ensureInit();
  const r = (await q(
    `SELECT id, email, name, picture, google_sub AS "googleSub",
            created_at AS "createdAt", last_login AS "lastLogin"
     FROM users WHERE id = $1`,
    [id]
  )).rows[0];
  if (!r) return null;
  return {
    ...r,
    createdAt: Number(r.createdAt),
    lastLogin: r.lastLogin ? Number(r.lastLogin) : null
  };
}

// === Chats ===
export async function listChatsWithMessages(userId) {
  await ensureInit();
  if (!userId) return [];
  const chats = await q(
    `SELECT id, title, mode, user_id AS "userId", project_id AS "projectId",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM chats WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  if (chats.rows.length === 0) return [];
  const ids = chats.rows.map(c => c.id);
  const msgs = await q(
    `SELECT id, chat_id AS "chatId", role, content, created_at AS "createdAt"
     FROM messages WHERE chat_id = ANY($1::text[]) ORDER BY created_at ASC`,
    [ids]
  );
  const byChatId = new Map();
  for (const m of msgs.rows) {
    if (!byChatId.has(m.chatId)) byChatId.set(m.chatId, []);
    byChatId.get(m.chatId).push({
      id: m.id, role: m.role, content: m.content, createdAt: Number(m.createdAt)
    });
  }
  return chats.rows.map(c => ({
    ...c,
    createdAt: Number(c.createdAt),
    updatedAt: Number(c.updatedAt),
    messages: byChatId.get(c.id) || []
  }));
}

export async function getChat(id, userId) {
  await ensureInit();
  const c = (await q(
    `SELECT id, title, mode, user_id AS "userId", project_id AS "projectId",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM chats WHERE id = $1`,
    [id]
  )).rows[0];
  if (!c) return null;
  if (userId && c.userId !== userId) return null; // hide cross-user
  const m = await q(
    `SELECT id, chat_id AS "chatId", role, content, created_at AS "createdAt"
     FROM messages WHERE chat_id = $1 ORDER BY created_at ASC`,
    [id]
  );
  return {
    ...c,
    createdAt: Number(c.createdAt),
    updatedAt: Number(c.updatedAt),
    messages: m.rows.map(x => ({
      id: x.id, role: x.role, content: x.content, createdAt: Number(x.createdAt)
    }))
  };
}

export async function createChat({ title = 'Percakapan Baru', mode = 'auto', userId } = {}) {
  await ensureInit();
  const id = `chat-${nanoid(10)}`;
  const now = Date.now();
  await q(
    `INSERT INTO chats (id, user_id, title, mode, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)`,
    [id, userId || null, title, mode, now]
  );
  return { id, userId: userId || null, title, mode, createdAt: now, updatedAt: now, messages: [] };
}

export async function updateChat(id, { title, mode }, userId) {
  await ensureInit();
  const existing = (await q(
    `SELECT title, mode, user_id FROM chats WHERE id = $1`, [id]
  )).rows[0];
  if (!existing) return null;
  if (userId && existing.user_id !== userId) return null;
  const now = Date.now();
  await q(
    `UPDATE chats SET title = $1, mode = $2, updated_at = $3 WHERE id = $4`,
    [title ?? existing.title, mode ?? existing.mode, now, id]
  );
  return getChat(id, userId);
}

export async function deleteChat(id, userId) {
  await ensureInit();
  const r = await q(
    `DELETE FROM chats WHERE id = $1 ${userId ? 'AND user_id = $2' : ''}`,
    userId ? [id, userId] : [id]
  );
  return r.rowCount > 0;
}

// === Messages ===
export async function addMessage(chatId, { role, content }) {
  await ensureInit();
  const id = `msg-${nanoid(12)}`;
  const now = Date.now();
  await q(
    `INSERT INTO messages (id, chat_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [id, chatId, role, content, now]
  );
  await q(`UPDATE chats SET updated_at = $1 WHERE id = $2`, [now, chatId]);
  return { id, chatId, role, content, createdAt: now };
}

export async function updateMessage(id, content) {
  await ensureInit();
  await q(`UPDATE messages SET content = $1 WHERE id = $2`, [content, id]);
}

export async function deleteMessage(id, userId) {
  await ensureInit();
  if (userId) {
    const r = await q(
      `DELETE FROM messages WHERE id = $1 AND chat_id IN (SELECT id FROM chats WHERE user_id = $2)`,
      [id, userId]
    );
    return r.rowCount > 0;
  }
  const r = await q(`DELETE FROM messages WHERE id = $1`, [id]);
  return r.rowCount > 0;
}

// === Documents ===
export async function createDocument({ chatId = null, filename, mimeType = null, text, userId = null }) {
  await ensureInit();
  const id = `doc-${nanoid(12)}`;
  const now = Date.now();
  const charCount = text ? text.length : 0;
  await q(
    `INSERT INTO documents (id, user_id, chat_id, filename, mime_type, char_count, text, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, userId, chatId, filename, mimeType, charCount, text || '', now]
  );
  return { id, userId, chatId, filename, mimeType, charCount, createdAt: now };
}

export async function getDocument(id, userId) {
  await ensureInit();
  const r = (await q(
    `SELECT id, user_id AS "userId", chat_id AS "chatId", filename, mime_type AS "mimeType",
            char_count AS "charCount", text, created_at AS "createdAt"
     FROM documents WHERE id = $1`,
    [id]
  )).rows[0];
  if (!r) return null;
  if (userId && r.userId && r.userId !== userId) return null;
  return { ...r, createdAt: Number(r.createdAt) };
}

export async function listDocumentsByChat(chatId, userId) {
  await ensureInit();
  const params = userId ? [chatId, userId] : [chatId];
  const where = userId ? `chat_id = $1 AND user_id = $2` : `chat_id = $1`;
  const r = await q(
    `SELECT id, filename, char_count AS "charCount", created_at AS "createdAt"
     FROM documents WHERE ${where} ORDER BY created_at DESC`,
    params
  );
  return r.rows.map(x => ({ ...x, createdAt: Number(x.createdAt) }));
}

export async function deleteDocument(id, userId) {
  await ensureInit();
  const r = await q(
    `DELETE FROM documents WHERE id = $1 ${userId ? 'AND user_id = $2' : ''}`,
    userId ? [id, userId] : [id]
  );
  return r.rowCount > 0;
}

// === RAG: chunks + vectors ===
function vecLiteral(arr) {
  // pgvector accepts text literal '[1,2,3]' for vector type
  return '[' + Array.from(arr).join(',') + ']';
}

export async function insertChunksWithEmbeddings(documentId, chunks) {
  await ensureInit();
  const client = await pool.connect();
  let count = 0;
  try {
    await client.query('BEGIN');
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await client.query(
        `INSERT INTO document_chunks (document_id, chunk_index, text, char_start, char_end, embedding)
         VALUES ($1, $2, $3, $4, $5, $6::vector)`,
        [documentId, i, c.text, c.charStart ?? null, c.charEnd ?? null, vecLiteral(c.embedding)]
      );
      count++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return count;
}

export async function searchSimilarChunks(queryEmbedding, k = 5, userId = null) {
  await ensureInit();
  // <=> = cosine distance di pgvector. Filter per-user via JOIN documents.
  const params = userId ? [vecLiteral(queryEmbedding), k, userId] : [vecLiteral(queryEmbedding), k];
  const userFilter = userId ? `AND d.user_id = $3` : '';
  const r = await q(
    `SELECT
       dc.id           AS "chunkId",
       dc.text         AS text,
       dc.chunk_index  AS "chunkIndex",
       d.id            AS "documentId",
       d.filename      AS filename,
       (dc.embedding <=> $1::vector) AS distance
     FROM document_chunks dc
     JOIN documents d ON d.id = dc.document_id
     WHERE dc.embedding IS NOT NULL ${userFilter}
     ORDER BY dc.embedding <=> $1::vector
     LIMIT $2`,
    params
  );
  return r.rows.map(x => ({ ...x, distance: Number(x.distance) }));
}

export const EMBED_DIMENSIONS = EMBED_DIM;

// === Images ===
export async function createImage({ chatId = null, filename, mimeType, filePath, userId = null }) {
  await ensureInit();
  const id = `img-${nanoid(12)}`;
  const now = Date.now();
  await q(
    `INSERT INTO images (id, user_id, chat_id, filename, mime_type, file_path, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, userId, chatId, filename, mimeType, filePath, now]
  );
  return { id, userId, chatId, filename, mimeType, filePath, createdAt: now };
}

export async function getImage(id, userId) {
  await ensureInit();
  const r = (await q(
    `SELECT id, user_id AS "userId", chat_id AS "chatId", filename, mime_type AS "mimeType",
            file_path AS "filePath", created_at AS "createdAt"
     FROM images WHERE id = $1`,
    [id]
  )).rows[0];
  if (!r) return null;
  if (userId && r.userId && r.userId !== userId) return null;
  return { ...r, createdAt: Number(r.createdAt) };
}

export async function deleteImage(id, userId) {
  await ensureInit();
  const r = await q(
    `DELETE FROM images WHERE id = $1 ${userId ? 'AND user_id = $2' : ''}`,
    userId ? [id, userId] : [id]
  );
  return r.rowCount > 0;
}

// === Memories ===
export async function saveMemory({ content, tags = '', userId = null }) {
  await ensureInit();
  const id = `mem-${nanoid(12)}`;
  const now = Date.now();
  await q(
    `INSERT INTO memories (id, user_id, content, tags, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)`,
    [id, userId, content, tags, now]
  );
  return { id, userId, content, tags, createdAt: now, updatedAt: now };
}

export async function listMemories(userId) {
  await ensureInit();
  if (!userId) return [];
  const r = await q(
    `SELECT id, content, tags, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM memories WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100`,
    [userId]
  );
  return r.rows.map(x => ({ ...x, createdAt: Number(x.createdAt), updatedAt: Number(x.updatedAt) }));
}

export async function searchMemories(query, limit = 10, userId = null) {
  await ensureInit();
  if (!userId) return [];
  const like = `%${query}%`;
  const r = await q(
    `SELECT id, content, tags, created_at AS "createdAt"
     FROM memories
     WHERE user_id = $1 AND (content ILIKE $2 OR tags ILIKE $2)
     ORDER BY updated_at DESC LIMIT $3`,
    [userId, like, limit]
  );
  return r.rows.map(x => ({ ...x, createdAt: Number(x.createdAt) }));
}

export async function deleteMemory(id, userId) {
  await ensureInit();
  const r = await q(
    `DELETE FROM memories WHERE id = $1 ${userId ? 'AND user_id = $2' : ''}`,
    userId ? [id, userId] : [id]
  );
  return r.rowCount > 0;
}

// === Projects ===
export async function createProject({ name, description = '', userId = null }) {
  await ensureInit();
  const id = `prj-${nanoid(10)}`;
  const now = Date.now();
  await q(
    `INSERT INTO projects (id, user_id, name, description, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, name, description, now]
  );
  return { id, userId, name, description, createdAt: now };
}

export async function listProjects(userId) {
  await ensureInit();
  if (!userId) return [];
  const r = await q(
    `SELECT id, name, description, created_at AS "createdAt" FROM projects
     WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return r.rows.map(x => ({ ...x, createdAt: Number(x.createdAt) }));
}

export async function getProject(id, userId) {
  await ensureInit();
  const r = (await q(
    `SELECT id, user_id AS "userId", name, description, created_at AS "createdAt"
     FROM projects WHERE id = $1`,
    [id]
  )).rows[0];
  if (!r) return null;
  if (userId && r.userId !== userId) return null;
  return { ...r, createdAt: Number(r.createdAt) };
}

export async function updateProject(id, { name, description }, userId) {
  await ensureInit();
  const existing = await getProject(id, userId);
  if (!existing) return null;
  await q(
    `UPDATE projects SET name = $1, description = $2 WHERE id = $3`,
    [name ?? existing.name, description ?? existing.description, id]
  );
  return getProject(id, userId);
}

export async function deleteProject(id, userId) {
  await ensureInit();
  const r = await q(
    `DELETE FROM projects WHERE id = $1 ${userId ? 'AND user_id = $2' : ''}`,
    userId ? [id, userId] : [id]
  );
  return r.rowCount > 0;
}

export async function listChatsByProject(projectId, userId) {
  await ensureInit();
  const params = userId ? [projectId, userId] : [projectId];
  const where = userId ? `project_id = $1 AND user_id = $2` : `project_id = $1`;
  const r = await q(
    `SELECT id, title, mode, project_id AS "projectId",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM chats WHERE ${where} ORDER BY updated_at DESC`,
    params
  );
  return r.rows.map(x => ({ ...x, createdAt: Number(x.createdAt), updatedAt: Number(x.updatedAt) }));
}

export async function setChatProject(chatId, projectId, userId) {
  await ensureInit();
  await q(
    `UPDATE chats SET project_id = $1 WHERE id = $2 ${userId ? 'AND user_id = $3' : ''}`,
    userId ? [projectId, chatId, userId] : [projectId, chatId]
  );
}

export async function listDocumentsByProject(projectId, userId) {
  await ensureInit();
  const params = userId ? [projectId, userId] : [projectId];
  const where = userId ? `c.project_id = $1 AND c.user_id = $2` : `c.project_id = $1`;
  const r = await q(
    `SELECT d.id, d.filename, d.char_count AS "charCount", d.created_at AS "createdAt"
     FROM documents d
     JOIN chats c ON c.id = d.chat_id
     WHERE ${where}
     ORDER BY d.created_at DESC`,
    params
  );
  return r.rows.map(x => ({ ...x, createdAt: Number(x.createdAt) }));
}

export default pool;