// File storage di VPS disk untuk image upload.
// Path konfigurasi via env STORAGE_DIR (default /var/turtle/files).
// Lokal dev: fallback ke ./data/files.

import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '..', 'data', 'files');
const IMAGES_DIR = path.join(STORAGE_DIR, 'images');

let initialized = false;
async function ensureDir() {
  if (initialized) return;
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  initialized = true;
}

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

/**
 * Simpan image buffer ke disk. Returns relative file_path (mis "images/abc.png").
 */
export async function saveImage(buffer, mimeType) {
  await ensureDir();
  const ext = MIME_EXT[mimeType] || 'bin';
  const name = `${nanoid(16)}.${ext}`;
  const fullPath = path.join(IMAGES_DIR, name);
  await fs.writeFile(fullPath, buffer);
  return path.posix.join('images', name); // simpan relative path utk DB
}

/**
 * Read image binary dari disk based on relative path.
 */
export async function readImage(relPath) {
  await ensureDir();
  const safe = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(STORAGE_DIR, safe);
  if (!full.startsWith(STORAGE_DIR)) throw new Error('path traversal blocked');
  return fs.readFile(full);
}

/**
 * Convert disk image → data URL untuk dikirim ke vision LLM.
 */
export async function imageToDataUrl(relPath, mimeType) {
  const buf = await readImage(relPath);
  return `data:${mimeType};base64,${buf.toString('base64')}`;
}

export async function deleteImageFile(relPath) {
  if (!relPath) return;
  try {
    const safe = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(STORAGE_DIR, safe);
    if (!full.startsWith(STORAGE_DIR)) return;
    await fs.unlink(full);
  } catch {
    // ignore (file mungkin sudah hilang)
  }
}

export const storageRoot = STORAGE_DIR;
