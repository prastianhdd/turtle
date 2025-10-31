import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import model from './gemini.js'; 
import Sidebar from './Sidebar.jsx'; // <-- IMPORT KOMPONEN BARU
import './App.css'; 

// --- (Konstanta PROMPT Anda tetap sama) ---
const PROMPT_ROLE = `Role: Peneliti Akademik / Analis Riset\n\n`;
const PROMPT_TASK = `Task: 
1. Melakukan penelitian literatur (studi pusaka) yang mendalam dan kritis mengenai topik di bawah ini.
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

// Fungsi helper untuk membuat chat baru
const createNewChat = () => ({
  id: `chat-${Date.now()}`,
  title: 'Percakapan Baru',
  messages: [], // messages sekarang adalah bagian dari objek chat
});

function App() {
  
  // --- STATE BARU: Mengelola SEMUA percakapan ---
  const [allChats, setAllChats] = useState(() => {
    const savedChats = localStorage.getItem('geminiMultiChat');
    if (savedChats) {
      return JSON.parse(savedChats);
    }
    return [createNewChat()]; // Mulai dengan satu percakapan baru
  });

  // --- STATE BARU: Melacak chat mana yang sedang aktif ---
  const [activeChatId, setActiveChatId] = useState(() => {
    const savedActiveId = localStorage.getItem('geminiActiveChatId');
    // Pastikan ID yang tersimpan masih ada di allChats, jika tidak, gunakan yang pertama
    const chats = JSON.parse(localStorage.getItem('geminiMultiChat') || '[]');
    if (savedActiveId && chats.some(chat => chat.id === savedActiveId)) {
      return savedActiveId;
    }
    return chats.length > 0 ? chats[0].id : createNewChat().id;
  });

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const chatWindowRef = useRef(null);

  // --- EFEK BARU: Simpan SEMUA chat & ID aktif ---
  useEffect(() => {
    localStorage.setItem('geminiMultiChat', JSON.stringify(allChats));
    localStorage.setItem('geminiActiveChatId', activeChatId);
  }, [allChats, activeChatId]);

  // --- EFEK LAMA: Scroll ke bawah (logika tetap sama) ---
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [allChats, activeChatId]); // Perhatikan: trigger berubah

  // --- LOGIKA BARU: Temukan chat yang aktif saat ini ---
  const activeChat = allChats.find(chat => chat.id === activeChatId) || allChats[0];
  // Jika activeChat tidak ditemukan (error), fallback ke chat pertama
  // atau buat chat baru jika allChats kosong
  useEffect(() => {
    if (!activeChat && allChats.length > 0) {
      setActiveChatId(allChats[0].id);
    } else if (allChats.length === 0) {
      const newChat = createNewChat();
      setAllChats([newChat]);
      setActiveChatId(newChat.id);
    }
  }, [activeChat, allChats]);


  // --- LOGIKA BARU: Membuat chat baru ---
  const handleNewChat = () => {
    const newChat = createNewChat();
    setAllChats([newChat, ...allChats]); // Tambahkan ke ATAS daftar
    setActiveChatId(newChat.id);
  };

  // --- LOGIKA BARU: Pindah chat ---
  const handleSelectChat = (chatId) => {
    setActiveChatId(chatId);
  };

  // --- LOGIKA UTAMA: handleSubmit (Diperbarui) ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt || loading || !activeChat) return;

    setLoading(true);

    const PROMPT_TOPIK = `Topik: ${prompt}\n\n`; 
    const fullPrompt = 
      PROMPT_ROLE + 
      PROMPT_TASK + 
      PROMPT_TOPIK + 
      PROMPT_SINTESIS + 
      PROMPT_CONSTRAINTS;

    const userMessage = { role: 'user', parts: [{ text: prompt }] };
    const initialModelMessage = { role: 'model', parts: [{ text: "" }] };

    // Tentukan apakah ini pesan pertama (untuk mengubah judul)
    const isFirstMessage = activeChat.messages.length === 0;
    
    // Update state allChats
    setAllChats(currentChats => 
      currentChats.map(chat => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            // Jika pesan pertama, update judul, jika tidak, biarkan
            title: isFirstMessage ? prompt.substring(0, 40) : chat.title, 
            // Tambahkan pesan pengguna DAN placeholder model
            messages: [...chat.messages, userMessage, initialModelMessage]
          };
        }
        return chat;
      })
    );
    setPrompt('');

    try {
      const result = await model.generateContentStream(fullPrompt);
      const stream = result.stream; 

      let accumulatedText = "";
      
      for await (const chunk of stream) {
        const chunkText = chunk.text();
        accumulatedText += chunkText;
        
        // Update state secara fungsional
        setAllChats(currentChats =>
          currentChats.map(chat => {
            if (chat.id === activeChatId) {
              const newMessages = [...chat.messages];
              // Update teks di pesan TERAKHIR (placeholder model)
              newMessages[newMessages.length - 1].parts[0].text = accumulatedText;
              return { ...chat, messages: newMessages };
            }
            return chat;
          })
        );
      }

    } catch (error) {
      console.error("Error generating content:", error);
      const specificErrorMessage = `[DEBUG] Maaf, terjadi kesalahan: ${error.message}`;
      const errorMessage = { role: 'model', parts: [{ text: specificErrorMessage }] };
      
      setAllChats(currentChats =>
        currentChats.map(chat => {
          if (chat.id === activeChatId) {
            const newMessages = [...chat.messages];
            // Ganti placeholder dengan pesan error
            newMessages[newMessages.length - 1] = errorMessage;
            return { ...chat, messages: newMessages };
          }
          return chat;
        })
      );
    } finally {
      setLoading(false);
    }
  };

  // --- RENDER BARU: Menggunakan Layout 2 Kolom ---
  return (
    <div className="app-layout"> {/* Kontainer utama baru */}
      
      {/* Kolom Sidebar */}
      <Sidebar 
        allChats={allChats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
      />

      {/* Kolom Chat Utama */}
      <div className="main-chat-area">
        <header className="app-header">
          {/* Tampilkan judul chat yang aktif */}
          <h1>{activeChat ? activeChat.title : 'Asisten Riset'}</h1>
          {/* Tombol 'Percakapan Baru' di sini dihapus, pindah ke Sidebar */}
        </header>
        
        <div className="chat-window" ref={chatWindowRef}>
          {/* Render pesan HANYA dari chat yang aktif */}
          {activeChat && activeChat.messages.map((msg, index) => (
            <div key={index} className={`chat-bubble ${msg.role}`}>
              {msg.role === 'user' ? (
                <p>{msg.parts[0].text}</p>
              ) : (
                <ReactMarkdown>{msg.parts[0].text}</ReactMarkdown>
              )}
            </div>
          ))}
          
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
            placeholder="Masukkan Topik Penelitian (misal: Blockchain dalam maksimal 300 kata)"
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Memproses...' : 'Kirim'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;