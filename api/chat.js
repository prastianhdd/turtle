import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// --- (UPGRADE) HANYA API KEY GEMINI YANG DIPERLUKAN ---
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
  console.error("FATAL: GEMINI_API_KEY environment variable not set.");
}

const genAI = new GoogleGenerativeAI(geminiApiKey);

// --- (PROMPT RISET ANDA DI SINI, tidak perlu diubah) ---
const PROMPT_ROLE = `Role: Peneliti Akademik / Analis Riset\n\n`;
const PROMPT_TASK = `Task:
Melakukan penelitian literatur (studi pusaka) yang mendalam dan kritis mengenai {Topik}.
Mengidentifikasi, menganalisis, dan mensintesis informasi dari berbagai sumber kredibel.
Menghasilkan rangkuman sintetis yang koheren, komprehensif, dan objektif berdasarkan temuan penelitian.\n\n`;
const PROMPT_SINTESIS = `Sintesis & Penulisan :
Parafrasa Mendalam (Wajib): Seluruh rangkuman harus ditulis ulang menggunakan bahasa dan struktur kalimat sendiri. Ini bukan sekadar mengganti sinonim (spin text). WAJIB mengubah struktur kalimat (misal: dari aktif ke pasif, memecah 1 kalimat kompleks menjadi 2 kalimat, atau menggabungkan 2 kalimat singkat) dan urutan penyampaian poin, selama alur logika tetap terjaga. DILARANG keras melakukan salin-tempel atau model "tambal sulam".
Objektivitas: Rangkuman harus secara akurat dan netral mewakili ide, argumen, dan data dari penulis asli. Jangan memasukkan opini, interpretasi, atau kritik pribadi.
Bahasa Baku: Gunakan bahasa Indonesia yang formal, baku (sesuai EYD dan KBBI), jelas, dan efektif.
Fokus pada Inti: Identifikasi dan sampaikan tesis utama (ide pokok), argumen pendukung, metodologi (jika relevan), dan kesimpulan dari sumber.
5. Gaya Penulisan Lanjutan (Anti-Deteksi): 
   * Variasi Struktur Kalimat (Burstiness): Ini sangat penting. Hindari keseragaman panjang kalimat. Gunakan kombinasi kalimat pendek (misalnya 5-10 kata) untuk penegasan, diikuti oleh kalimat yang lebih panjang dan kompleks (25-35 kata) yang menggunakan anak kalimat atau konjungsi. Ritme tulisan harus terasa dinamis, bukan monoton.
   * Variasi Pilihan Kata (Perplexity): Hindari penggunaan kata atau frasa yang paling umum secara berulang. Gunakan sinonim yang tepat namun bervariasi. Jika sebuah konsep dapat dijelaskan dengan beberapa cara, jangan selalu memilih cara yang paling standar atau "paling aman".
   * Alur Logika Natural: Meskipun harus formal dan objektif, alur tulisan harus terasa seperti seorang analis yang memandu pembaca, bukan seperti ensiklopedia yang kaku. Gunakan kata transisi (misalnya "namun", "selain itu", "akibatnya") secara wajar, tetapi jangan berlebihan. Biarkan beberapa paragraf mengalir secara logis tanpa kata transisi eksplisit jika hubungannya sudah jelas.\n\n`;
const PROMPT_CONSTRAINTS = `Required Constraints:
Kredibilitas Sumber: Referensi utama HARUS berasal dari sumber ilmiah atau akademik (Jurnal, Buku Akademik, Laporan Penelitian Resmi, Prosiding Konferensi).
Eksklusi Sumber: Dilarang menggunakan blog pribadi, forum, media sosial, atau Wikipedia sebagai sumber sitasi.
Relevansi Waktu: Prioritaskan sumber 5-10 tahun terakhir, kecuali topik bersifat historis.
Daftar Pustaka: Wajib menyertakan Daftar Pustaka lengkap untuk setiap klaim yang diparafrasa.
`;
// --------------------------------------------------------

// --- (GOOGLE SEARCH TOOL DIHAPUS) ---
// --- (executeGoogleSearch DIHAPUS) ---

// --- (SAFETY SETTINGS, tidak perlu diubah, ini bagus) ---
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// --- (UPGRADE) Definisikan Model Sesuai Permintaan Anda ---
const researchModel = genAI.getGenerativeModel({ 
  model: "gemini-2.5-pro", // Sesuai permintaan Anda
  safetySettings: safetySettings
});

const normalModel = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash", // Sesuai permintaan Anda
  // 'tools' dihapus
  safetySettings: safetySettings
});
// --------------------------------------------------------

// --- HANDLER API UTAMA ---
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!genAI) {
    return res.status(500).json({ error: 'Server configuration error: API Key missing.' });
  }

  try {
    const { currentUserPrompt, history, mode } = req.body;

    if (!currentUserPrompt) {
      return res.status(400).json({ error: 'currentUserPrompt is required' });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache');

    if (mode === 'research') {
      // --- MODE RISET (Tidak Berubah) ---
      const PROMPT_TOPIK = `Topic: ${currentUserPrompt}\n\n`;
      const fullPrompt = PROMPT_ROLE + PROMPT_TASK + PROMPT_TOPIK + PROMPT_SINTESIS + PROMPT_CONSTRAINTS;
      
      const result = await researchModel.generateContentStream(fullPrompt);
      for await (const chunk of result.stream) {
        // Cek safety block (penting)
        if (chunk.promptFeedback && chunk.promptFeedback.blockReason) {
          const blockReason = chunk.promptFeedback.blockReason;
          console.error(`Stream Riset diblokir: ${blockReason}`);
          res.write(`[DEBUG] Permintaan Anda diblokir oleh filter keamanan: ${blockReason}.`);
          break;
        }
        if (chunk.text()) {
          res.write(chunk.text());
        }
      }
      res.end();

    } else {
      // --- MODE NORMAL (Disederhanakan: Tanpa Tools) ---
      const geminiHistory = history.map(msg => ({
        role: msg.role,
        parts: msg.parts,
      }));

      const chat = normalModel.startChat({ history: geminiHistory });
      let stream = (await chat.sendMessageStream(currentUserPrompt)).stream;

      for await (const chunk of stream) {
        
        // Cek safety block (penting)
        if (chunk.promptFeedback && chunk.promptFeedback.blockReason) {
          const blockReason = chunk.promptFeedback.blockReason;
          console.error(`Stream Normal diblokir: ${blockReason}`);
          res.write(`[DEBUG] Permintaan Anda ("${currentUserPrompt}") diblokir oleh filter keamanan: ${blockReason}. Coba gunakan prompt yang lain.`);
          break;
        }

        // --- (LOGIKA FUNCTION CALL DIHAPUS) ---
        
        if (chunk.text()) {
          res.write(chunk.text());
        }
      }
      res.end();
    }

  } catch (error) {
    console.error("Error di serverless function:", error.message);
    
    if (res.headersSent) {
      res.write(`\n\n[DEBUG] Terjadi kesalahan fatal: ${error.message}`);
      res.end();
    } else {
      res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
  }
}