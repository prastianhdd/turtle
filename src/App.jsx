import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
// import model from './gemini.js'; // Kita sudah hapus ini, bagus
import Sidebar from './Sidebar.jsx';
import './App.css'; 

// --- KITA HAPUS SEMUA PROMPT DARI FRONTEND ---
// Ini semua akan pindah ke backend.

const createNewChat = () => ({
  id: `chat-${Date.now()}`,
  title: 'Percakapan Baru',
  messages: [],
  mode: 'research'
});

function App() {
  const [allChats, setAllChats] = useState(() => {
    const savedChats = localStorage.getItem('geminiMultiChat');
    if (savedChats) {
      const parsedChats = JSON.parse(savedChats);
      return parsedChats.map(chat => ({ ...chat, mode: chat.mode || 'research' }));
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

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
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

  const handleNewChat = () => {
    const newChat = createNewChat();
    setAllChats([newChat, ...allChats]);
    setActiveChatId(newChat.id);
    setIsSidebarOpen(false);
  };

  const handleSelectChat = (chatId) => {
    setActiveChatId(chatId);
    setIsSidebarOpen(false);
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

  // --- (UPGRADE 5.B) handleSubmit MENGIRIM PESAN & MODE ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt || loading || !activeChat) return;

    setLoading(true);

    const userMessage = { role: 'user', parts: [{ text: prompt }] };
    const initialModelMessage = { role: 'model', parts: [{ text: "" }] };
    const isFirstMessage = activeChat.messages.length === 0;

    // Ambil riwayat pesan SEBELUM menambahkan pesan baru
    const chatHistory = activeChat.messages;
    
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
    const currentPrompt = prompt; // Simpan prompt saat ini
    setPrompt('');

    try {
      // 1. Panggil API backend kita dengan payload baru
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // KIRIM PESAN BARU, RIWAYAT LAMA, dan MODE
        body: JSON.stringify({ 
          currentUserPrompt: currentPrompt,
          history: chatHistory,
          mode: activeChat.mode 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // 2. Baca stream dari API backend kita
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunkText = decoder.decode(value);
        accumulatedText += chunkText;
        
        // 3. Update UI seperti sebelumnya
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

  const isChatStarted = activeChat && activeChat.messages.length > 0;

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
        <div className="mode-selector-container">
          <div className="mode-selector">
            <button 
              className={`mode-btn ${activeChat?.mode === 'research' ? 'active' : ''}`}
              onClick={() => handleModeChange('research')}
              disabled={isChatStarted}
            >
              Asisten Riset
            </button>
            <button 
              className={`mode-btn ${activeChat?.mode === 'normal' ? 'active' : ''}`}
              onClick={() => handleModeChange('normal')}
              disabled={isChatStarted}
            >
              Chat Normal
            </button>
          </div>
          {isChatStarted && (
            <span className="mode-locked-tooltip">
              Mode terkunci setelah pesan pertama.
            </span>
          )}
        </div>
        <form className="chat-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              activeChat?.mode === 'research' 
                ? "Masukkan Topik Penelitian (misal: Blockchain)"
                : "Tanya apa saja (misal: tahun berapa sekarang?)"
            }
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