import { useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble';
import SpikeMark from './SpikeMark';

const SUGGESTIONS = {
  auto: [
    { icon: '✦', text: 'Jelaskan apa itu MCP server dengan ringkas' },
    { icon: '✦', text: 'Tulis script Python untuk scrape headline berita' },
    { icon: '✦', text: 'Bantu saya debug error TypeScript ini' }
  ],
  research: [
    { icon: '⌕', text: 'Riset tren AI agent framework 2026' },
    { icon: '⌕', text: 'Tinjauan literatur transformer untuk NLP' },
    { icon: '⌕', text: 'Bandingkan database vector terbaik' }
  ],
  summary: [
    { icon: '📄', text: 'Unggah PDF panjang lalu minta ringkasan' },
    { icon: '📄', text: 'Unggah file .md notes lalu rangkum poin kunci' },
    { icon: '📄', text: 'Tempel teks artikel lalu minta 5 takeaway' }
  ],
  paraphrase: [
    { icon: '✎', text: 'Parafrasa paragraf jadi gaya lebih natural' },
    { icon: '✎', text: 'Tulis ulang teks formal jadi casual' },
    { icon: '✎', text: 'Sederhanakan kalimat panjang' }
  ],
  chat: [
    { icon: '✦', text: 'Brainstorm ide nama produk SaaS' },
    { icon: '✦', text: 'Apa beda PostgreSQL vs MySQL?' },
    { icon: '✦', text: 'Hitung mean dari [12, 18, 24, 30, 36]' }
  ]
};

const SCROLL_THRESHOLD = 80; // px dari bawah

function ChatWindow({
  messages,
  loading,
  bootstrapping,
  chatWindowRef,
  onCopy,
  copiedId,
  mode,
  onRegenerate,
  onEditUser
}) {
  const [showJump, setShowJump] = useState(false);
  const userScrolledRef = useRef(false);

  const scrollToBottom = (smooth = true) => {
    const el = chatWindowRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    userScrolledRef.current = false;
    setShowJump(false);
  };

  // Track posisi scroll user
  useEffect(() => {
    const el = chatWindowRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = distance < SCROLL_THRESHOLD;
      userScrolledRef.current = !atBottom;
      setShowJump(!atBottom && messages.length > 0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [chatWindowRef, messages.length]);

  // Auto-scroll cuma kalau user di-bottom
  useEffect(() => {
    if (!userScrolledRef.current && chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages, loading, chatWindowRef]);

  const suggestions = SUGGESTIONS[mode] || SUGGESTIONS.auto;
  const lastIdx = messages.length - 1;
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return i;
    }
    return -1;
  })();

  return (
    <div className="chat-window" ref={chatWindowRef}>
      {bootstrapping && messages.length === 0 && (
        <div className="welcome-screen">
          <div className="skeleton skeleton-line skeleton-line--lg skeleton-line--w-60" />
          <div className="skeleton skeleton-line skeleton-line--w-80" />
          <div className="skeleton skeleton-line skeleton-line--w-40" />
        </div>
      )}

      {!bootstrapping && messages.length === 0 && !loading && (
        <div className="welcome-screen">
          <SpikeMark className="welcome-spike" size={28} />
          <h2>Halo, mau kerjakan apa?</h2>
          <p>Akses Claude Opus 4.7 tanpa batas. Tanya apa saja, riset, ringkas dokumen, parafrasa, generate kode.</p>

          <div className="welcome-suggestions">
            {suggestions.map((s, i) => (
              <div key={i} className="suggestion-card">
                <span className="suggestion-icon">{s.icon}</span>
                <span>{s.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {messages.map((msg, index) => {
        const isLast = index === lastIdx;
        const isLastAssistant = isLast && msg.role === 'assistant';
        const isStreaming = isLastAssistant && loading;
        return (
          <MessageBubble
            key={msg.id || `tmp-${index}`}
            message={msg}
            onCopy={(text) => onCopy(text, msg.id)}
            isCopied={copiedId === msg.id}
            isStreaming={isStreaming}
            onRegenerate={isLastAssistant && !loading ? onRegenerate : null}
            onEditUser={index === lastUserIdx && !loading ? (newText) => onEditUser?.(newText) : null}
          />
        );
      })}

      {loading && messages.length === 0 && (
        <div className="loading-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      )}

      {showJump && (
        <button
          type="button"
          className="scroll-to-bottom"
          onClick={() => scrollToBottom(true)}
          aria-label="Lompat ke bawah"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
          Pesan baru
        </button>
      )}
    </div>
  );
}

export default ChatWindow;
