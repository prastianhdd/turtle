import { GoogleGenerativeAI } from "@google/generative-ai";

// Ambil API key dari environment variable
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("VITE_GEMINI_API_KEY tidak ditemukan. Pastikan .env sudah benar.");
}

const genAI = new GoogleGenerativeAI(apiKey);

// Pilih model.
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

export default model;