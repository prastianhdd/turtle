import { useState, useCallback, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './components/Header';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import MemoryDrawer from './components/MemoryDrawer';
import LandingPage from './components/LandingPage';
import { useChat } from './hooks/useChat';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import './styles/themes.css';
import './styles/gemini.css';
import './styles/sidebar.css';
import './styles/landing.css';

function App() {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <div className="landing-bootstrap" aria-hidden="true">
        <div className="skeleton skeleton-line skeleton-line--lg skeleton-line--w-40" />
      </div>
    );
  }
  if (auth.required && !auth.authenticated) {
    return <LandingPage onLogin={auth.loginWithGoogle} error={auth.error} />;
  }

  return <AppShell user={auth.user} onLogout={auth.logout} />;
}

function AppShell({ user, onLogout }) {
  const {
    chats,
    activeChat,
    activeChatId,
    loading,
    agentStatus,
    toolEvents,
    chatWindowRef,
    bootstrapping,
    createChat,
    selectChat,
    deleteChat,
    changeMode,
    sendMessage,
    stopGeneration,
    renameChat,
    regenerate,
    editLastUserMessage
  } = useChat();

  const { isDark, toggleTheme } = useTheme();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Lock body scroll saat drawer/sidebar terbuka di mobile
  useEffect(() => {
    const shouldLock = isSidebarOpen || isMemoryOpen;
    document.body.classList.toggle('no-scroll', shouldLock);
    return () => document.body.classList.remove('no-scroll');
  }, [isSidebarOpen, isMemoryOpen]);

  const handleNewChat = useCallback(() => {
    createChat('auto');
    setIsSidebarOpen(false);
  }, [createChat]);

  const handleSelectChat = useCallback((chatId) => {
    selectChat(chatId);
    setIsSidebarOpen(false);
  }, [selectChat]);

  const handleCopy = useCallback((text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleSubmit = useCallback((payload) => {
    sendMessage(payload);
  }, [sendMessage]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const currentMode = activeChat?.mode || 'auto';

  return (
    <div className="app-layout">
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={deleteChat}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenMemory={() => setIsMemoryOpen(true)}
        onLogout={onLogout}
        user={user}
      />

      <div className="main-content">
        <Header
          title={activeChat?.title || 'Turtle AI'}
          onMenuClick={toggleSidebar}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onTitleChange={activeChatId ? (t) => renameChat(activeChatId, t) : null}
        />

        {agentStatus && loading && (
          <div className="agent-status">
            {agentStatus.agent && (
              <span className="agent-status__chip">
                <span className="agent-status__dot"></span>
                Agent: <strong>{labelFor(agentStatus.intent)}</strong>
              </span>
            )}
            {agentStatus.message && <span>{agentStatus.message}</span>}
            {agentStatus.router?.reason && (
              <span className="agent-status__reason">{agentStatus.router.reason}</span>
            )}
          </div>
        )}

        {toolEvents.length > 0 && loading && (
          <div className="tool-events">
            {toolEvents.map(t => (
              <div key={t.id} className={`tool-event tool-event--${t.status}`}>
                <span className="tool-event__icon">
                  {t.status === 'running' && '⏳'}
                  {t.status === 'done' && '✓'}
                  {t.status === 'error' && '✕'}
                </span>
                <span className="tool-event__name">{toolLabel(t.name)}</span>
                {t.args?.query && <span className="tool-event__query">"{t.args.query}"</span>}
                {t.args?.expression && <span className="tool-event__query">{t.args.expression}</span>}
                {t.error && <span className="tool-event__error">{t.error}</span>}
              </div>
            ))}
          </div>
        )}

        <ChatWindow
          messages={activeChat?.messages || []}
          loading={loading}
          bootstrapping={bootstrapping}
          chatWindowRef={chatWindowRef}
          onCopy={handleCopy}
          copiedId={copiedId}
          mode={currentMode}
          onRegenerate={regenerate}
          onEditUser={editLastUserMessage}
        />

        <ChatInput
          mode={currentMode}
          onSubmit={handleSubmit}
          onModeChange={changeMode}
          onStop={stopGeneration}
          loading={loading}
        />
      </div>

      <MemoryDrawer open={isMemoryOpen} onClose={() => setIsMemoryOpen(false)} />
    </div>
  );
}

function labelFor(intent) {
  switch (intent) {
    case 'research':   return 'Literature Reviewer';
    case 'summarize':  return 'Summarizer';
    case 'paraphrase': return 'Paraphraser';
    case 'chat':       return 'Chat';
    default:           return intent || 'Asisten';
  }
}

function toolLabel(name) {
  switch (name) {
    case 'web_search': return 'Web Search';
    case 'arxiv':      return 'arXiv';
    case 'calculator': return 'Calculator';
    case 'rag_search': return 'Dokumen (RAG)';
    default:           return name;
  }
}

export default App;
