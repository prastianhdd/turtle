// Gunakan sintaks ES Module (import)
import { GoogleGenerativeAI } from '@google/generative-ai';

// 1. Ambil API Key dari Environment Variables
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("FATAL: GEMINI_API_KEY environment variable not set.");
}

// Inisialisasi di luar handler
let genAI;
if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
}

// 2. Ini adalah handler API Vercel menggunakan export default
export default async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Cek API Key sekali lagi saat runtime
  if (!genAI) {
    console.error("API Key is missing or service not initialized.");
    return res.status(500).json({ error: 'Server configuration error: API Key missing.' });
  }

  try {
    const { fullPrompt } = req.body;

    if (!fullPrompt) {
      return res.status(400).json({ error: 'fullPrompt is required' });
    }

    // 3. Logika streaming
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContentStream(fullPrompt);
    const stream = result.stream;

    // 4. Atur header untuk streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    // Atur header tambahan untuk Vercel agar tidak timeout
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache');


    // 5. Kirim stream kembali ke frontend
    for await (const chunk of stream) {
      const chunkText = chunk.text();
      res.write(chunkText); // Kirim setiap chunk
    }

    res.end(); // Akhiri stream

  } catch (error) {
    console.error("Error di serverless function:", error.message);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}