// /api/chat.cjs
// Gunakan sintaks CommonJS (require)

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// --- (UPGRADE) Impor prompt dari file .cjs ---
const { 
  PROMPT_ROLE, 
  PROMPT_TASK, 
  PROMPT_SINTESIS, 
  PROMPT_CONSTRAINTS 
} = require('./prompts.cjs');
// ----------------------------------------------------

const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
  console.error("FATAL: GEMINI_API_KEY environment variable not set.");
}

const genAI = new GoogleGenerativeAI(geminiApiKey);

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const researchModel = genAI.getGenerativeModel({ 
  model: "gemini-2.5-pro",
  safetySettings: safetySettings
});

const normalModel = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  safetySettings: safetySettings
});

// --- HANDLER API UTAMA (Gunakan module.exports) ---
module.exports = async (req, res) => {
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
      const PROMPT_TOPIK = `Topic: ${currentUserPrompt}\n\n`;
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
};s