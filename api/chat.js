// Menggunakan sintaks Node.js (CommonJS) untuk Vercel Serverless
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. Ambil API Key dari Environment Variables (BUKAN VITE_)
// Di Vercel, ini harus diatur sebagai GEMINI_API_KEY
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 2. Ini adalah handler API Vercel
export default async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { fullPrompt } = req.body;

    if (!fullPrompt) {
      return res.status(400).json({ error: 'fullPrompt is required' });
    }

    // 3. Logika streaming dipindahkan ke backend
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContentStream(fullPrompt);
    const stream = result.stream;

    // 4. Atur header untuk streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // 5. Kirim stream kembali ke frontend
    for await (const chunk of stream) {
      const chunkText = chunk.text();
      res.write(chunkText); // Kirim setiap chunk
    }

    res.end(); // Akhiri stream

  } catch (error) {
    console.error("Error di serverless function:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}