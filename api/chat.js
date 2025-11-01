// /api/chat.js
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google-generative-ai';

// --- (UPGRADE 1) Impor prompt dari file terpisah ---
import { 
  PROMPT_ROLE, 
  PROMPT_TASK, 
  PROMPT_SINTESIS, 
  PROMPT_CONSTRAINTS 
} from './prompts.js';
// ----------------------------------------------------

const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
  console.error("FATAL: GEMINI_API_KEY environment variable not set.");
}

const genAI = new GoogleGenerativeAI(geminiApiKey);

// --- (PROMPT LAMA DIHAPUS DARI SINI) ---

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// --- (UPGRADE 2) Definisikan Model Sesuai Permintaan Anda ---
const researchModel = genAI.getGenerativeModel({ 
  model: "gemini-2.5-pro", // Sesuai permintaan Anda
  safetySettings: safetySettings
});

const normalModel = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash", // Sesuai permintaan Anda
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
      // --- MODE RISET (Menggunakan prompt yang diimpor) ---
      const PROMPT_TOPIK = `Topic: ${currentUserPrompt}\n\n`;
      // Gunakan konstanta yang diimpor
      const fullPrompt = PROMPT_ROLE + PROMPT_TASK + PROMPT_TOPIK + PROMPT_SINTESIS + PROMPT_CONSTRAINTS;
      
      const result = await researchModel.generateContentStream(fullPrompt);
      for await (const chunk of result.stream) {
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
      // --- MODE NORMAL (Menggunakan model 'flash') ---
      const geminiHistory = history.map(msg => ({
        role: msg.role,
        parts: msg.parts,
      }));

      const chat = normalModel.startChat({ history: geminiHistory });
      let stream = (await chat.sendMessageStream(currentUserPrompt)).stream;

      for await (const chunk of stream) {
        if (chunk.promptFeedback && chunk.promptFeedback.blockReason) {
          const blockReason = chunk.promptFeedback.blockReason;
          console.error(`Stream Normal diblokir: ${blockReason}`);
          res.write(`[DEBUG] Permintaan Anda ("${currentUserPrompt}") diblokir oleh filter keamanan: ${blockReason}. Coba gunakan prompt yang lain.`);
          break;
        }
        
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