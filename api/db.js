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

  await q(`
    CREATE TABLE IF NOT EXISTS chats (
      id          TEXT PRIMARY KEY,
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
      chat_id     TEXT REFERENCES chats(id) ON DELETE SET NULL,
      filename    TEXT NOT NULL,
      mime_type   TEXT NOT NULL,
      data_url    TEXT NOT NULL,
      created_at  BIGINT NOT NULL
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS memories (
      id          TEXT PRIMARY KEY,
      content     TEXT NOT NULL,
      tags        TEXT,
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      created_at  BIGINT NOT NULL
    )
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_documents_chat_id ON documents(chat_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id)`);
  // ANN index untuk vector — pakai HNSW (lebih akurat dari IVF), cosine distance
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

// === Chats ===
export async function listChatsWithMessages() {
  await ensureInit();
  const chats = await q(
    `SELECT id, title, mode, project_id AS "projectId",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM chats ORDER BY updated_at DESC`
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

export async function getChat(id) {
  await ensureInit();
  const c = (await q(
    `SELECT id, title, mode, project_id AS "projectId",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM chats WHERE id = $1`,
    [id]
  )).rows[0];
  if (!c) return null;
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

export async function createChat({ title = 'Percakapan Baru', mode = 'auto' } = {}) {
  await ensureInit();
  const id = `chat-${nanoid(10)}`;
  const now = Date.now();
  await q(
    `INSERT INTO chats (id, title, mode, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)`,
    [id, title, mode, now]
  );
  return { id, title, mode, createdAt: now, updatedAt: now, messages: [] };
}

export async function updateChat(id, { title, mode }) {
  await ensureInit();
  const existing = (await q(
    `SELECT title, mode FROM chats WHERE id = $1`, [id]
  )).rows[0];
  if (!existing) return null;
  const now = Date.now();
  await q(
    `UPDATE chats SET title = $1, mode = $2, updated_at = $3 WHERE id = $4`,
    [title ?? existing.title, mode ?? existing.mode, now, id]
  );
  return getChat(id);
}

export async function deleteChat(id) {
  await ensureInit();
  const r = await q(`DELETE FROM chats WHERE id = $1`, [id]);
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

export async function deleteMessage(id) {
  await ensureInit();
  const r = await q(`DELETE FROM messages WHERE id = $1`, [id]);
  return r.rowCount > 0;
}

// === Documents ===
export async function createDocument({ chatId = null, filename, mimeType = null, text }) {
  await ensureInit();
  const id = `doc-${nanoid(12)}`;
  const now = Date.now();
  const charCount = text ? text.length : 0;
  await q(
    `INSERT INTO documents (id, chat_id, filename, mime_type, char_count, text, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, chatId, filename, mimeType, charCount, text || '', now]
  );
  return { id, chatId, filename, mimeType, charCount, createdAt: now };
}

export async function getDocument(id) {
  await ensureInit();
  const r = (await q(
    `SELECT id, chat_id AS "chatId", filename, mime_type AS "mimeType",
            char_count AS "charCount", text, created_at AS "createdAt"
     FROM documents WHERE id = $1`,
    [id]
  )).rows[0];
  if (!r) return null;
  return { ...r, createdAt: Number(r.createdAt) };
}

export async function listDocumentsByChat(chatId) {
  await ensureInit();
  const r = await q(
    `SELECT id, filename, char_count AS "charCount", created_at AS "createdAt"
     FROM documents WHERE chat_id = $1 ORDER BY created_at DESC`,
    [chatId]
  );
  return r.rows.map(x => ({ ...x, createdAt: Number(x.createdAt) }));
}

export async function deleteDocument(id) {
  await ensureInit();
  const r = await q(`DELETE FROM documents WHERE id = $1`, [id]);
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

export async function searchSimilarChunks(queryEmbedding, k = 5) {
  await ensureInit();
  // <=> = cosine distance di pgvector
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
     WHERE dc.embedding IS NOT NULL
     ORDER BY dc.embedding <=> $1::vector
     LIMIT $2`,
    [vecLiteral(queryEmbedding), k]
  );
  return r.rows.map(x => ({ ...x, distance: Number(x.distance) }));
}

export const EMBED_DIMENSIONS = EMBED_DIM;

// === Images ===
export async function createImage({ chatId = null, filename, mimeType, dataUrl }) {
  await ensureInit();
  const id = `img-${nanoid(12)}`;
  const now = Date.now();
  await q(
    `INSERT INTO images (id, chat_id, filename, mime_type, data_url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, chatId, filename, mimeType, dataUrl, now]
  );
  return { id, chatId, filename, mimeType, createdAt: now };
}

export async function getImage(id) {
  await ensureInit();
  const r = (await q(
    `SELECT id, chat_id AS "chatId", filename, mime_type AS "mimeType",
            data_url AS "dataUrl", created_at AS "createdAt"
     FROM images WHERE id = $1`,
    [id]
  )).rows[0];
  if (!r) return null;
  return { ...r, createdAt: Number(r.createdAt) };
}

export async function deleteImage(id) {
  await ensureInit();
  const r = await q(`DELETE FROM images WHERE id = $1`, [id]);
  return r.rowCount > 0;
}

// === Memories ===
export async function saveMemory({ content, tags = '' }) {
  await ensureInit();
  const id = `mem-${nanoid(12)}`;
  const now = Date.now();
  await q(
    `INSERT INTO memories (id, content, tags, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4)`,
    [id, content, tags, now]
  );
  return { id, content, tags, createdAt: now, updatedAt: now };
}

export async function listMemories() {
  await ensureInit();
  const r = await q(
    `SELECT id, content, tags, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM memories ORDER BY updated_at DESC LIMIT 100`
  );
  return r.rows.map(x => ({ ...x, createdAt: Number(x.createdAt), updatedAt: Number(x.updatedAt) }));
}

export async function searchMemories(query, limit = 10) {
  await ensureInit();
  const like = `%${query}%`;
  const r = await q(
    `SELECT id, content, tags, created_at AS "createdAt"
     FROM memories
     WHERE content ILIKE $1 OR tags ILIKE $1
     ORDER BY updated_at DESC LIMIT $2`,
    [like, limit]
  );
  return r.rows.map(x => ({ ...x, createdAt: Number(x.createdAt) }));
}

export async function deleteMemory(id) {
  await ensureInit();
  const r = await q(`DELETE FROM memories WHERE id = $1`, [id]);
  return r.rowCount > 0;
}

// === Projects ===
export async function createProject({ name, description = '' }) {
  await ensureInit();
  const id = `prj-${nanoid(10)}`;
  const now = Date.now();
  await q(
    `INSERT INTO projects (id, name, description, created_at) VALUES ($1, $2, $3, $4)`,
    [id, name, description, now]
  );
  return { id, name, description, createdAt: now };
}

export async function listProjects() {
  await ensureInit();
  const r = await q(
    `SELECT id, name, description, created_at AS "createdAt" FROM projects ORDER BY created_at DESC`
  );
  return r.rows.map(x => ({ ...x, createdAt: Number(x.createdAt) }));
}

export async function getProject(id) {
  await ensureInit();
  const r = (await q(
    `SELECT id, name, description, created_at AS "createdAt" FROM projects WHERE id = $1`,
    [id]
  )).rows[0];
  if (!r) return null;
  return { ...r, createdAt: Number(r.createdAt) };
}

export async function updateProject(id, { name, description }) {
  await ensureInit();
  const existing = await getProject(id);
  if (!existing) return null;
  await q(
    `UPDATE projects SET name = $1, description = $2 WHERE id = $3`,
    [name ?? existing.name, description ?? existing.description, id]
  );
  return getProject(id);
}

export async function deleteProject(id) {
  await ensureInit();
  const r = await q(`DELETE FROM projects WHERE id = $1`, [id]);
  return r.rowCount > 0;
}

export async function listChatsByProject(projectId) {
  await ensureInit();
  const r = await q(
    `SELECT id, title, mode, project_id AS "projectId",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM chats WHERE project_id = $1 ORDER BY updated_at DESC`,
    [projectId]
  );
  return r.rows.map(x => ({ ...x, createdAt: Number(x.createdAt), updatedAt: Number(x.updatedAt) }));
}

export async function setChatProject(chatId, projectId) {
  await ensureInit();
  await q(`UPDATE chats SET project_id = $1 WHERE id = $2`, [projectId, chatId]);
}

export async function listDocumentsByProject(projectId) {
  await ensureInit();
  const r = await q(
    `SELECT d.id, d.filename, d.char_count AS "charCount", d.created_at AS "createdAt"
     FROM documents d
     JOIN chats c ON c.id = d.chat_id
     WHERE c.project_id = $1
     ORDER BY d.created_at DESC`,
    [projectId]
  );
  return r.rows.map(x => ({ ...x, createdAt: Number(x.createdAt) }));
}

export default pool;