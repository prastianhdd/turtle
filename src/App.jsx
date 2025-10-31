import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import model from './gemini.js'; 
import Sidebar from './Sidebar.jsx';
import './App.css'; 

// --- (Semua konstanta PROMPT Anda tetap sama) ---
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

const createNewChat = () => ({
  id: `chat-${Date.now()}`,
  title: 'Percakapan Baru',
  messages: [],
});

function App() {
  const [allChats, setAllChats] = useState(() => {
    const savedChats = localStorage.getItem('geminiMultiChat');
    return savedChats ? JSON.parse(savedChats) : [createNewChat()];
  });

  const [activeChatId, setActiveChatId] = useState(() => {
    const savedActiveId = localStorage.getItem('geminiActiveChatId');
    const chats = JSON.parse(localStorage.getItem('geminiMultiChat') || '[]');
    if (savedActiveId && chats.some(chat => chat.id === savedActiveId)) {
      return savedActiveId;
    }
    return chats.length > 0 ? chats[0].id : createNewChat().id;
  });

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  // --- (UPGRADE 3) State untuk mengontrol sidebar di mobile ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const chatWindowRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('geminiMultiChat', JSON.stringify(allChats));
    localStorage.setItem('geminiActiveChatId', activeChatId);
  }, [allChats, activeChatId]);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [allChats, activeChatId, isSidebarOpen]);

  const activeChat = allChats.find(chat => chat.id === activeChatId) || allChats[0];
  useEffect(() => {
    if (!activeChat && allChats.length > 0) {
      setActiveChatId(allChats[0].id);
    } else if (allChats.length === 0) {
      const newChat = createNewChat();
      setAllChats([newChat]);
      setActiveChatId(newChat.id);
    }
  }, [activeChat, allChats]);

  // --- (UPGRADE 3) Modifikasi: Tutup sidebar setelah aksi ---
  const handleNewChat = () => {
    const newChat = createNewChat();
    setAllChats([newChat, ...allChats]);
    setActiveChatId(newChat.id);
    setIsSidebarOpen(false); // Tutup sidebar
  };

  // --- (UPGRADE 3) Modifikasi: Tutup sidebar setelah aksi ---
  const handleSelectChat = (chatId) => {
    setActiveChatId(chatId);
    setIsSidebarOpen(false); // Tutup sidebar
  };

  const handleDeleteChat = (chatId) => {
    const filteredChats = allChats.filter(chat => chat.id !== chatId);
    
    if (filteredChats.length === 0) {
      const newChat = createNewChat();
      setAllChats([newChat]);
      setActiveChatId(newChat.id);
    } else if (activeChatId === chatId) {
      setActiveChatId(filteredChats[0].id);
      setAllChats(filteredChats);
    } else {
      setAllChats(filteredChats);
    }
    // Tidak perlu tutup sidebar, karena tombol hapus ada di dalam sidebar
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

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
    const isFirstMessage = activeChat.messages.length === 0;
    
    setAllChats(currentChats => 
      currentChats.map(chat => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            title: isFirstMessage ? prompt.substring(0, 40) : chat.title, 
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
        
        setAllChats(currentChats =>
          currentChats.map(chat => {
            if (chat.id === activeChatId) {
              const newMessages = [...chat.messages];
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

  return (
    // --- (UPGRADE 3) Tambah kelas kondisional 'sidebar-open' ---
    <div className={`app-layout ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      
      {/* --- (UPGRADE 3) Overlay untuk mobile --- */}
      {isSidebarOpen && (
        <div className="mobile-overlay" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      <Sidebar 
        allChats={allChats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
      />

      <div className="main-chat-area">
        <header className="app-header">
          {/* --- (UPGRADE 3) Tombol Menu (Hamburger) --- */}
          <button className="menu-btn" onClick={() => setIsSidebarOpen(true)}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <h1>{activeChat ? activeChat.title : 'Asisten Riset'}</h1>
        </header>
        
        {/* --- (UPGRADE) Tambahkan 'key' untuk memicu animasi saat ganti chat --- */}
        <div className="chat-window" ref={chatWindowRef} key={activeChatId}>
          {activeChat && activeChat.messages.map((msg, index) => (
            <div key={index} className={`chat-bubble ${msg.role}`}>
              {msg.role === 'user' ? (
                <p>{msg.parts[0].text}</p>
              ) : (
                <>
                  {msg.parts[0].text && (
                    <button 
                      onClick={() => handleCopy(msg.parts[0].text, index)} 
                      className={`copy-btn ${copiedIndex === index ? 'copied' : ''}`}
                      disabled={copiedIndex === index}
                    >
                      {copiedIndex === index ? 'Disalin!' : 'Salin'}
                    </button>
                  )}
                  <ReactMarkdown>{msg.parts[0].text}</ReactMarkdown>
                </>
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
            placeholder="Masukkan Topik Penelitian (misal: Blockchain)"
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