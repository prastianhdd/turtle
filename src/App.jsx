import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Sidebar from './Sidebar.jsx';
import './App.css'; 

// --- BARU: Import PDF.js ---
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.mjs`;

// --- (PROMPT UNTUK RISET TETAP SAMA) ---
const PROMPT_ROLE = `Role: Peneliti Akademik / Analis Riset\n\n`;
const PROMPT_TASK = `Task:
- Melakukan penelitian literatur (studi pusaka) yang mendalam dan kritis mengenai {Topik}.
- Mengidentifikasi, menganalisis, dan mensintesis informasi dari berbagai sumber kredibel.
- Menghasilkan rangkuman sintetis yang koheren, komprehensif, dan objektif berdasarkan temuan penelitian.\n\n`;
const PROMPT_SINTESIS = `Sintesis & Penulisan :
- Parafrasa Mendalam (Wajib): Seluruh rangkuman harus ditulis ulang menggunakan bahasa dan struktur kalimat sendiri. Ini bukan sekadar mengganti sinonim (spin text). WAJIB mengubah struktur kalimat (misal: dari aktif ke pasif, memecah 1 kalimat kompleks menjadi 2 kalimat, atau menggabungkan 2 kalimat singkat) dan urutan penyampaian poin, selama alur logika tetap terjaga. DILARANG keras melakukan salin-tempel atau model "tambal sulam".
- Rangkuman harus secara akurat dan netral mewakili ide, argumen, dan data dari penulis asli. Jangan memasukkan opini, interpretasi, atau kritik pribadi.
- Gunakan bahasa Indonesia yang formal, baku (sesuai EYD dan KBBI), jelas, dan efektif.
- Identifikasi dan sampaikan tesis utama (ide pokok), argumen pendukung, metodologi (jika relevan), dan kesimpulan dari sumber.
- Gaya Penulisan Lanjutan (Anti-Deteksi): 
   * Variasi Struktur Kalimat (Burstiness): Ini sangat penting. Hindari keseragaman panjang kalimat. Gunakan kombinasi kalimat pendek (misalnya 5-10 kata) untuk penegasan, diikuti oleh kalimat yang lebih panjang dan kompleks (25-35 kata) yang menggunakan anak kalimat atau konjungsi. Ritme tulisan harus terasa dinamis, bukan monoton.
   * Hindari penggunaan kata atau frasa yang paling umum secara berulang. Gunakan sinonim yang tepat namun bervariasi. Jika sebuah konsep dapat dijelaskan dengan beberapa cara, jangan selalu memilih cara yang paling standar atau "paling aman".
   * Alur tulisan harus terasa seperti seorang analis yang memandu pembaca, bukan seperti ensiklopedia yang kaku. Gunakan kata transisi (misalnya "namun", "selain itu", "akibatnya") secara wajar, tetapi jangan berlebihan. Biarkan beberapa paragraf mengalir secara logis tanpa kata transisi eksplisit jika hubungannya sudah jelas.\n\n`;
const PROMPT_CONSTRAINTS = `Required Constraints:
- Referensi utama HARUS berasal dari sumber ilmiah atau akademik (Jurnal, Buku Akademik, Laporan Penelitian Resmi, Prosiding Konferensi).
- Dilarang menggunakan blog pribadi, forum, media sosial, atau Wikipedia sebagai sumber sitasi.
- Wajib menyertakan Daftar Pustaka lengkap untuk setiap klaim yang diparafrasa.
`;
// ------------------------------------------

// --- BARU: PROMPT UNTUK MODE MERINGKAS ---
const PROMPT_SUMMARY_TASK = `Role: Analis Profesional

Task:
- Anda akan menerima sebuah teks mentah (bisa jadi dari hasil OCR atau ekstraksi file).
- Tugas utama Anda adalah meringkas teks tersebut secara komprehensif.
- Identifikasi poin-poin utama, ide pokok, dan kesimpulan dari teks.
- Abaikan noise, teks footer/header yang berulang, atau artefak format yang tidak relevan.
- Hasilkan ringkasan yang jelas, padat, dan koheren dalam bahasa Indonesia yang formal dan baku.
- Jika teks terlihat seperti transkrip atau memiliki format yang aneh, lakukan yang terbaik untuk mengekstrak maknanya.

Format Output:
- Berikan ringkasan dalam format Markdown yang terstruktur. 
- Gunakan bullet points untuk poin-poin penting jika sesuai.
- Parafrasa kalimat untuk mengindarkan pendeteksi AI

Teks yang Akan Diringkas:
---
`; // Teks asli akan ditambahkan di bawah ini

// ------------------------------------------

const createNewChat = () => ({
  id: `chat-${Date.now()}`,
  title: 'Percakapan Baru',
  messages: [],
  mode: 'research' // Default mode tetap research
});

function App() {
  const [allChats, setAllChats] = useState(() => {
    const savedChats = localStorage.getItem('geminiMultiChat');
    if (savedChats) {
      const parsedChats = JSON.parse(savedChats);
      // Pastikan mode 'normal' lama diubah ke 'research' jika ada
      return parsedChats.map(chat => ({ 
        ...chat, 
        mode: chat.mode === 'normal' ? 'research' : (chat.mode || 'research') 
      }));
    }
    return [createNewChat()];
  });

  const [activeChatId, setActiveChatId] = useState(() => {
    const savedActiveId = localStorage.getItem('geminiActiveChatId');
    const chats = JSON.parse(localStorage.getItem('geminiMultiChat') || '[]');
    if (savedActiveId && chats.some(chat => chat.id === savedActiveId)) {
      return savedActiveId;
    }
    const firstChatId = chats.length > 0 ? chats[0].id : null;
    return firstChatId || createNewChat().id;
  });

  // --- MODIFIKASI: Pisah state untuk input yang berbeda ---
  const [researchPrompt, setResearchPrompt] = useState(''); // Untuk mode riset
  const [summaryText, setSummaryText] = useState(''); // Untuk mode meringkas
  const [inputFileName, setInputFileName] = useState(''); // Nama file yg diupload
  
  const [loading, setLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false); // --- BARU: Loading state untuk PDF
  const [copiedIndex, setCopiedIndex] = useState(null);
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
  }, [allChats, activeChatId, isSidebarOpen, loading]); // Tambahkan loading

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

  const handleNewChat = () => {
    const newChat = createNewChat();
    setAllChats([newChat, ...allChats]);
    setActiveChatId(newChat.id);
    setIsSidebarOpen(false);
    // --- BARU: Reset input ---
    setResearchPrompt('');
    setSummaryText('');
    setInputFileName('');
  };

  const handleSelectChat = (chatId) => {
    setActiveChatId(chatId);
    setIsSidebarOpen(false);
    // --- BARU: Reset input ---
    setResearchPrompt('');
    setSummaryText('');
    setInputFileName('');
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
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleModeChange = (newMode) => {
    if (activeChat && activeChat.messages.length === 0) {
      setAllChats(currentChats =>
        currentChats.map(chat =>
          chat.id === activeChatId ? { ...chat, mode: newMode } : chat
        )
      );
    }
  };

  // --- BARU (VERSI 2): Fungsi untuk parsing file PDF (Lebih Robust) ---
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      return; // Tidak ada file dipilih
    }
    
    if (file.type !== 'application/pdf') {
      alert("Silakan unggah file PDF.");
      e.target.value = null; // Reset input
      return;
    }

    setIsParsing(true);
    setSummaryText('');
    setInputFileName(file.name);

    const fileReader = new FileReader();

    // Pindahkan try..catch ke DALAM onload
    fileReader.onload = async (event) => {
      try {
        const typedArray = new Uint8Array(event.target.result);
        const loadingTask = pdfjsLib.getDocument(typedArray);
        const pdf = await loadingTask.promise;

        let allText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          allText += pageText + '\n\n'; // Tambah spasi antar halaman
        }
        
        setSummaryText(allText);
        // setIsParsing(false); // Dihapus dari sini, dipindah ke 'finally'

      } catch (error) {
        console.error("Error parsing PDF di dalam onload:", error);
        alert(`Gagal memproses file PDF: ${error.message}. Cek konsol (F12) untuk detail.`);
        setInputFileName(''); // Reset nama file jika gagal
        
      } finally {
        // Ini akan SELALU dijalankan, baik sukses atau gagal
        setIsParsing(false); 
      }
    };

    // Tambahkan error handler untuk FileReader itu sendiri
    fileReader.onerror = (error) => {
       console.error("Error FileReader:", error);
       alert("Gagal membaca file.");
       setIsParsing(false);
       setInputFileName('');
    };

    // Mulai membaca file
    fileReader.readAsArrayBuffer(file);
    
    // Reset input file agar bisa upload file yg sama lagi
    e.target.value = null;
  };

  // --- BARU: Fungsi untuk menjalankan stream (dipisah agar bisa dipakai ulang) ---
  const runStreamRequest = async (fullPrompt, userMessage) => {
    setLoading(true);

    const initialModelMessage = { role: 'model', parts: [{ text: "" }] };
    const isFirstMessage = activeChat.messages.length === 0;
    
    // Tentukan judul jika ini pesan pertama
    let chatTitle = activeChat.title;
    if (isFirstMessage) {
      if (activeChat.mode === 'research') {
        chatTitle = userMessage.parts[0].text.substring(0, 40);
      } else if (activeChat.mode === 'summary') {
        chatTitle = `Ringkasan: ${inputFileName || 'Teks'}`;
      }
    }

    setAllChats(currentChats => 
      currentChats.map(chat => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            title: chatTitle, 
            messages: [...chat.messages, userMessage, initialModelMessage]
          };
        }
        return chat;
      })
    );
    
    // Reset input
    setResearchPrompt('');
    setSummaryText('');
    setInputFileName('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fullPrompt }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunkText = decoder.decode(value);
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
      console.error("Error fetching stream:", error);
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


  // --- MODIFIKASI: handleSubmit utama sekarang jadi "router" ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || isParsing || !activeChat) return;

    if (activeChat.mode === 'research') {
      if (!researchPrompt) return;
      
      // Logika untuk Mode Riset
      const PROMPT_TOPIK = `Topic: ${researchPrompt}\n\n`;
      const fullPrompt = PROMPT_ROLE + PROMPT_TASK + PROMPT_TOPIK + PROMPT_SINTESIS + PROMPT_CONSTRAINTS;
      const userMessage = { role: 'user', parts: [{ text: researchPrompt }] };
      
      await runStreamRequest(fullPrompt, userMessage);

    } else if (activeChat.mode === 'summary') {
      if (!summaryText) return;

      // Logika untuk Mode Meringkas
      const fullPrompt = PROMPT_SUMMARY_TASK + summaryText;
      const userMessageText = inputFileName 
        ? `Tolong ringkas file: "${inputFileName}"`
        : `Tolong ringkas teks berikut: "${summaryText.substring(0, 50)}..."`;
      const userMessage = { role: 'user', parts: [{ text: userMessageText }] };

      await runStreamRequest(fullPrompt, userMessage);
    }
  };

  const isChatStarted = activeChat && activeChat.messages.length > 0;
  
  // --- BARU: Fungsi untuk render form input yang dinamis ---
  const renderInputForm = () => {
    const commonDisabled = loading || isParsing;

    if (activeChat?.mode === 'research') {
      return (
        <>
          <input
            type="text"
            value={researchPrompt}
            onChange={(e) => setResearchPrompt(e.target.value)}
            placeholder="Masukkan Topik Penelitian (misal: Blockchain)"
            disabled={commonDisabled}
          />
          <button type="submit" disabled={commonDisabled || !researchPrompt}>
            {loading ? 'Memproses...' : 'Kirim'}
          </button>
        </>
      );
    }

    if (activeChat?.mode === 'summary') {
      return (
        <div className="summary-input-area">
          <textarea
            className="summary-textarea"
            value={summaryText}
            onChange={(e) => setSummaryText(e.target.value)}
            placeholder={
              isParsing 
                ? 'Sedang memproses PDF...' 
                : 'Salin-tempel teks Anda di sini, atau unggah file PDF...'
            }
            disabled={commonDisabled}
          />
          <div className="summary-actions">
            <div>
              <label htmlFor="file-upload" className="file-input-label">
                {/* Ikon sederhana (opsional) */}
                <span>📁</span> 
                <span>{isParsing ? 'Memproses...' : (inputFileName || 'Unggah PDF')}</span>
              </label>
              <input 
                id="file-upload" 
                type="file" 
                accept=".pdf"
                onChange={handleFileChange}
                disabled={commonDisabled}
              />
            </div>
            <button type="submit" disabled={commonDisabled || !summaryText}>
              {loading ? 'Meringkas...' : 'Kirim Ringkasan'}
            </button>
          </div>
        </div>
      );
    }
    
    return null; // Fallback
  };

  return (
    <div className={`app-layout ${isSidebarOpen ? 'sidebar-open' : ''}`}>
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
          <button className="menu-btn" onClick={() => setIsSidebarOpen(true)}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <h1>{activeChat ? activeChat.title : 'Asisten Riset'}</h1>
        </header>
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
                  {/* --- MODIFIKASI: Tambahkan check untuk teks kosong --- */}
                  <ReactMarkdown>{msg.parts[0].text || "..."}</ReactMarkdown>
                </>
              )}
            </div>
          ))}
          {loading && !isParsing && ( // --- MODIFIKASI: Jangan tampilkan jika sedang parsing
            <div className="loading-indicator-container">
              <div className="loading-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}
        </div>
        <div className="mode-selector-container">
          <div className="mode-selector">
            {/* --- MODIFIKASI: Ubah tombol mode --- */}
            <button 
              className={`mode-btn ${activeChat?.mode === 'research' ? 'active' : ''}`}
              onClick={() => handleModeChange('research')}
              disabled={isChatStarted}
            >
              Asisten Riset
            </button>
            <button 
              className={`mode-btn ${activeChat?.mode === 'summary' ? 'active' : ''}`}
              onClick={() => handleModeChange('summary')}
              disabled={isChatStarted}
            >
              Meringkas File
            </button>
          </div>
          {isChatStarted && (
            <span className="mode-locked-tooltip">
              Mode terkunci setelah pesan pertama.
            </span>
          )}
        </div>
        <form className="chat-form" onSubmit={handleSubmit}>
          {/* --- MODIFIKASI: Panggil fungsi render dinamis --- */}
          {renderInputForm()}
        </form>
      </div>
    </div>
  );
}

export default App;