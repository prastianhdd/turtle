import { useState, useEffect, useRef } from 'react'; // <-- IMPORT useRef
import ReactMarkdown from 'react-markdown';
import model from './gemini.js'; 
import './App.css'; 

// --- (Semua konstanta PROMPT Anda tetap sama, tidak perlu diubah) ---
const PROMPT_ROLE = `Role: Peneliti Akademik / Analis Riset\n\n`;
const PROMPT_TASK = `Task: 
1. Melakukan penelitian literatur (studi pustaka) yang mendalam dan kritis mengenai topik di bawah ini.
2. Mengidentifikasi, menganalisis, dan mensintesis informasi dari berbagai sumber kredibel.
3. Menghasilkan rangkuman sintetis yang koheren, komprehensif, dan objektif berdasarkan temuan penelitian.\n\n`;
const PROMPT_SINTESIS = `Sintesis & Penulisan :
1.  Parafrasa (Wajib): Seluruh rangkuman harus ditulis ulang menggunakan bahasa dan struktur kalimat sendiri untuk menunjukkan pemahaman. DILARANG keras melakukan salin-tempel (copy-paste) atau merangkum model "tambal sulam" (menggabungkan potongan kalimat).
2.  Objektivitas: Rangkuman harus secara akurat dan netral mewakili ide, argumen, dan data dari penulis asli. Jangan memasukkan opini, interpretasi, atau kritik pribadi.
3.  Bahasa Baku: Gunakan bahasa Indonesia yang formal, baku (sesuai EYD dan KBBI), jelas, dan efektif.
4.  Fokus pada Inti: Identifikasi dan sampaikan tesis utama (ide pokok), argumen pendukung, metodologi (jika relevan), dan kesimpulan dari sumber.\n\n`;
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
  const [history, setHistory] = useState(() => {
    const savedHistory = localStorage.getItem('chatHistory');
    return savedHistory ? JSON.parse(savedHistory) : [];
  });
  
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Ref untuk men-scroll otomatis ke bagian bawah
  const chatWindowRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('chatHistory', JSON.stringify(history));
    // Scroll ke bawah setiap kali history berubah
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [history]);

  const handleNewChat = () => {
    setHistory([]);
  };

  // --- FUNGSI UTAMA DENGAN LOGIKA STREAMING ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt || loading) return;

    setLoading(true);

    const PROMPT_TOPIK = `Topik: ${prompt}\n\n`; 
    const fullPrompt = 
      PROMPT_ROLE + 
      PROMPT_TASK + 
      PROMPT_TOPIK + 
      PROMPT_SINTESIS + 
      PROMPT_CONSTRAINTS;

    const userMessage = { role: 'user', parts: [{ text: prompt }] };
    
    // 1. Tambahkan pesan pengguna DAN "placeholder" kosong untuk AI
    const initialModelMessage = { role: 'model', parts: [{ text: "" }] };
    setHistory([...history, userMessage, initialModelMessage]);
    setPrompt('');

    try {
      // 2. Dapatkan stream dari API
      const stream = await model.generateContentStream(fullPrompt);

      let accumulatedText = ""; // String untuk mengumpulkan teks
      
      // 3. Looping melalui stream
      for await (const chunk of stream) {
        const chunkText = chunk.text();
        accumulatedText += chunkText; // Tambahkan chunk baru ke teks
        
        // 4. Update state history dengan cara yang "fungsional"
        // Ini menggantikan item terakhir di array dengan versi barunya
        setHistory(currentHistory => {
          const newHistory = [...currentHistory];
          // Update teks dari pesan model (item terakhir)
          newHistory[newHistory.length - 1].parts[0].text = accumulatedText;
          return newHistory;
        });
      }

    } catch (error) {
      console.error("Error generating content:", error);
      const specificErrorMessage = `[DEBUG] Maaf, terjadi kesalahan: ${error.message}`;
      // Tambahkan pesan error sebagai item baru
      const errorMessage = { role: 'model', parts: [{ text: specificErrorMessage }] };
      setHistory(currentHistory => [...currentHistory, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Asisten Riset Akademik</h1>
        <button onClick={handleNewChat} className="new-chat-btn">
          Percakapan Baru
        </button>
      </header>
      
      {/* Tambahkan ref ke chat window */}
      <div className="chat-window" ref={chatWindowRef}>
        {history.map((msg, index) => (
          <div key={index} className={`chat-bubble ${msg.role}`}>
            {msg.role === 'user' ? (
              <p>{msg.parts[0].text}</p>
            ) : (
              // ReactMarkdown akan me-render ulang saat teks di-stream
              <ReactMarkdown>{msg.parts[0].text}</ReactMarkdown>
            )}
          </div>
        ))}

        {/* --- Indikator Loading BUKAN LAGI BUBBLE --- */}
        {/* Kita akan memodifikasinya agar sejajar dengan input box */}
        {loading && (
          <div className="loading-indicator-container">
            <div className="loading-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
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
          {/* Ubah teks tombol saat loading */}
          {loading ? 'Memproses...' : 'Kirim'}
        </button>
      </form>
    </div>
  );
}

export default App;