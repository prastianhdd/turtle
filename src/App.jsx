import { useState } from 'react';
import model from './gemini.js'; // Impor model (yang sudah disederhanakan)
import './App.css'; 

// --- DEKLARASI SETIAP BAGIAN PROMPT ---
// Bagian 1: Role
const PROMPT_ROLE = `Role: Peneliti Akademik / Analis Riset\n\n`;

// Bagian 2: Task
// (Kita tidak lagi menaruh {Topik} di sini)
const PROMPT_TASK = `Task: 
1. Melakukan penelitian literatur (studi pustaka) yang mendalam dan kritis mengenai topik di bawah ini.
2. Mengidentifikasi, menganalisis, dan mensintesis informasi dari berbagai sumber kredibel.
3. Menghasilkan rangkuman sintetis yang koheren, komprehensif, dan objektif berdasarkan temuan penelitian.\n\n`;

// Bagian 4: Sintesis & Penulisan
const PROMPT_SINTESIS = `Sintesis & Penulisan :
1.  Parafrasa (Wajib): Seluruh rangkuman harus ditulis ulang menggunakan bahasa dan struktur kalimat sendiri untuk menunjukkan pemahaman. DILARANG keras melakukan salin-tempel (copy-paste) atau merangkum model "tambal sulam" (menggabungkan potongan kalimat).
2.  Objektivitas: Rangkuman harus secara akurat dan netral mewakili ide, argumen, dan data dari penulis asli. Jangan memasukkan opini, interpretasi, atau kritik pribadi.
3.  Bahasa Baku: Gunakan bahasa Indonesia yang formal, baku (sesuai EYD dan KBBI), jelas, dan efektif.
4.  Fokus pada Inti: Identifikasi dan sampaikan tesis utama (ide pokok), argumen pendukung, metodologi (jika relevan), dan kesimpulan dari sumber.\n\n`;

// Bagian 5: Constraints
const PROMPT_CONSTRAINTS = `Required Constraints:
1.  Kredibilitas Sumber: Referensi utama HARUS berasal dari sumber ilmiah atau akademik. Prioritaskan:
    * Jurnal ilmiah (peer-reviewed).
    * Buku akademik/universitas yang diterbitkan oleh penerbit tepercaya.
    * Laporan penelitian resmi dari lembaga pemerintah atau organisasi internasional (misal: PBB, WHO, BPS).
    * Prosiding konferensi yang terakreditasi.
2.  Eksklusi Sumber: Dilarang menggunakan sumber yang tidak terverifikasi sebagai rujukan utama, seperti:
    * Blog pribadi.
    * Forum (misal: Quora, Kaskus).
    * Media sosial.
    * Wikipedia (hanya boleh digunakan sebagai titik awal mencari kata kunci, BUKAN sebagai sumber sitasi).
3.  Relevansi Waktu: Kecuali jika topik bersifat historis, prioritaskan sumber yang diterbitkan dalam 5-10 tahun terakhir untuk memastikan informasi tetap relevan dan mutakhir.
4.  Daftar Pustaka: Setiap ide, data, atau klaim yang diambil dari sumber (bahkan setelah diparafrasa) WAJIB disertai dengan Daftar Pustaka yang lengkap.
`;
// ------------------------------------------

function App() {
  const [history, setHistory] = useState([]); 
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt || loading) return;

    setLoading(true);

    // 1. BUAT PROMPT LENGKAP SESUAI URUTAN
    // Ini adalah Bagian 3: {Topik} dari input pengguna
    const PROMPT_TOPIK = `Topik: ${prompt}\n\n`; 

    // Gabungkan semua bagian sesuai urutan yang Anda minta
    const fullPrompt = 
      PROMPT_ROLE + 
      PROMPT_TASK + 
      PROMPT_TOPIK + 
      PROMPT_SINTESIS + 
      PROMPT_CONSTRAINTS;

    // 2. Tampilkan pesan pengguna di UI
    const userMessage = { role: 'user', parts: [{ text: prompt }] };
    const updatedHistory = [...history, userMessage]; 
    setHistory(updatedHistory);
    setPrompt('');

    try {
      // 3. Kirim prompt LENGKAP ke API
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      // 4. Tampilkan respons model di UI
      const modelMessage = { role: 'model', parts: [{ text: text }] };
      setHistory([...updatedHistory, modelMessage]);

    } catch (error) {
      console.error("Error generating content:", error);
      // Tampilkan pesan error yang lebih jelas di UI
      let errorMessageText = "Maaf, terjadi kesalahan saat memproses permintaan Anda.";
      if (error.message.includes('400')) {
        errorMessageText = "Terjadi kesalahan (400). Periksa API Key atau format permintaan.";
      } else if (error.message.includes('500')) {
         errorMessageText = "Terjadi kesalahan di server Google (500). Coba lagi nanti.";
      }
      
      const errorMessage = { role: 'model', parts: [{ text: errorMessageText }] };
      setHistory([...updatedHistory, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Asisten Riset Akademik</h1>
      </header>
      
      <div className="chat-window">
        {history.map((msg, index) => (
          <div key={index} className={`chat-bubble ${msg.role}`}>
            <pre>
              {msg.parts[0].text}
            </pre>
          </div>
        ))}
        {loading && <div className="chat-bubble model loading">...</div>}
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Masukkan Topik Penelitian (misal: Blockchain)"
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Meneliti...' : 'Kirim'}
        </button>
      </form>
    </div>
  );
}

export default App;