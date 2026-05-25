// RAG: chunker + ingest pipeline + retrieval.
// Chunk size 800 char, overlap 150 (sweet-spot untuk akademik berdasar literature).

import { embedMany, embed } from './embeddings.js';
import { insertChunksWithEmbeddings, searchSimilarChunks } from './db.js';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;
const MAX_CHUNKS_PER_DOC = 200; // hard-cap supaya dokumen raksasa tidak meledak DB

/**
 * Bagi teks jadi chunk fixed-size dengan overlap.
 * Coba pecah di batas paragraf/kalimat kalau memungkinkan, fallback ke karakter.
 */
export function chunkText(text, { size = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) {
  if (!text || text.length === 0) return [];
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (cleaned.length <= size) {
    return [{ text: cleaned, charStart: 0, charEnd: cleaned.length }];
  }

  const chunks = [];
  let cursor = 0;

  while (cursor < cleaned.length) {
    let end = Math.min(cursor + size, cleaned.length);

    // Coba snap ke batas paragraf/kalimat dalam 80 char terakhir agar tidak potong di tengah kata
    if (end < cleaned.length) {
      const tail = cleaned.slice(Math.max(end - 80, cursor), end);
      const lastBreak = Math.max(
        tail.lastIndexOf('\n\n'),
        tail.lastIndexOf('. '),
        tail.lastIndexOf('? '),
        tail.lastIndexOf('! ')
      );
      if (lastBreak > 40) {
        end = end - 80 + lastBreak + 1;
      }
    }

    const slice = cleaned.slice(cursor, end).trim();
    if (slice) {
      chunks.push({ text: slice, charStart: cursor, charEnd: end });
    }
    if (end >= cleaned.length) break;
    cursor = end - overlap;
    if (cursor < 0) cursor = 0;
  }

  return chunks.slice(0, MAX_CHUNKS_PER_DOC);
}

/**
 * Ingest dokumen: chunk → embed → simpan vec table.
 * Idempotent — gagal di tengah tidak rusak data lain karena transaction.
 *
 * @param {string} documentId
 * @param {string} text
 * @returns {Promise<{chunkCount: number}>}
 */
export async function ingestDocument(documentId, text) {
  const rawChunks = chunkText(text);
  if (rawChunks.length === 0) return { chunkCount: 0 };

  const embeddings = await embedMany(rawChunks.map(c => c.text));
  const enriched = rawChunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));

  const count = await insertChunksWithEmbeddings(documentId, enriched);
  return { chunkCount: count };
}

/**
 * Retrieve top-k chunk relevan utk query, di-scope per user kalau diberi.
 */
export async function retrieve(query, k = 5, userId = null) {
  if (!query || !query.trim()) return [];
  const queryVec = await embed(query);
  return await searchSimilarChunks(queryVec, k, userId);
}
