// PDF/text upload + image upload handler.
// Setelah simpan dokumen → trigger ingest RAG (chunk + embed + vec table) async.

import multer from 'multer';
import { extractText, getDocumentProxy } from 'unpdf';
import {
  createDocument,
  getDocument,
  listDocumentsByChat,
  deleteDocument,
  createImage,
  getImage,
  deleteImage
} from './db.js';
import { ingestDocument } from './rag.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
});

export const uploadMiddleware = upload.single('file');

function isPdfBuffer(buffer) {
  return buffer.length >= 4 && buffer.subarray(0, 4).equals(PDF_MAGIC);
}

async function extractPdfText(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n\n') : text;
}

export async function handleUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { originalname, mimetype, buffer } = req.file;
  const chatId = req.body?.chatId || null;
  const lowerName = (originalname || '').toLowerCase();

  let text = '';
  try {
    const looksLikePdf = mimetype === 'application/pdf' || lowerName.endsWith('.pdf');

    if (looksLikePdf) {
      if (!isPdfBuffer(buffer)) {
        return res.status(415).json({ error: 'File bukan PDF valid (magic bytes mismatch).' });
      }
      text = (await extractPdfText(buffer) || '').trim();
    } else if (mimetype.startsWith('text/') || /\.(txt|md)$/i.test(lowerName)) {
      text = buffer.toString('utf-8').trim();
    } else {
      return res.status(415).json({ error: `Tipe file tidak didukung: ${mimetype}` });
    }

    if (!text) {
      return res.status(422).json({ error: 'Tidak ada teks yang dapat diekstrak dari file.' });
    }

    const doc = await createDocument({
      chatId,
      filename: originalname,
      mimeType: mimetype,
      text
    });

    // Ingest RAG di background — jangan block respons.
    // Kalau gagal (mis. embed endpoint down), dokumen tetap tersimpan, retrieval saja yg kosong.
    ingestDocument(doc.id, text)
      .then(({ chunkCount }) => {
        console.log(`[ingest] ${doc.id} ${doc.filename}: ${chunkCount} chunks indexed`);
      })
      .catch(err => {
        console.error(`[ingest] ${doc.id} failed:`, err.message);
      });

    return res.status(201).json(doc);
  } catch (err) {
    console.error('[upload] parse error:', err.message);
    return res.status(500).json({ error: 'Gagal memproses file.' });
  }
}

export async function handleGetDocument(req, res) {
  const doc = await getDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json(doc);
}

export async function handleListDocuments(req, res) {
  const chatId = req.query.chatId;
  if (!chatId) return res.status(400).json({ error: 'chatId query required' });
  res.json(await listDocumentsByChat(chatId));
}

export async function handleDeleteDocument(req, res) {
  const ok = await deleteDocument(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Document not found' });
  res.status(204).end();
}

// === Image upload ===
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE }
});
export const imageUploadMiddleware = imageUpload.single('image');

export async function handleImageUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }
  const { originalname, mimetype, buffer } = req.file;
  const chatId = req.body?.chatId || null;

  if (!IMAGE_MIMES.includes(mimetype)) {
    return res.status(415).json({ error: `Tipe gambar tidak didukung: ${mimetype}` });
  }

  const dataUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
  const img = await createImage({
    chatId,
    filename: originalname,
    mimeType: mimetype,
    dataUrl
  });
  return res.status(201).json(img);
}

export async function handleGetImage(req, res) {
  const img = await getImage(req.params.id);
  if (!img) return res.status(404).json({ error: 'Image not found' });
  res.json(img);
}

export async function handleDeleteImage(req, res) {
  const ok = await deleteImage(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Image not found' });
  res.status(204).end();
}
