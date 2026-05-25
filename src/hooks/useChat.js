import { useState, useEffect, useRef, useCallback } from 'react';

async function api(path, opts = {}) {
  const isFormData = opts.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(opts.headers || {})
  };
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API ${path} ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function postJSON(path, body) {
  return api(path, { method: 'POST', body: JSON.stringify(body) });
}

export function useChat() {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [agentStatus, setAgentStatus] = useState(null);
  const [toolEvents, setToolEvents] = useState([]);
  const chatWindowRef = useRef(null);
  const ensuringRef = useRef(false);
  const abortControllerRef = useRef(null);

  const activeChat = chats.find(c => c.id === activeChatId) || null;

  // Bootstrap
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api('/api/chats');
        if (cancelled) return;
        if (list.length === 0) {
          ensuringRef.current = true;
          const created = await postJSON('/api/chats', { mode: 'auto' });
          if (cancelled) return;
          setChats([{ ...created, messages: [] }]);
          setActiveChatId(created.id);
          ensuringRef.current = false;
        } else {
          setChats(list);
          setActiveChatId(list[0].id);
        }
      } catch (err) {
        console.error('Bootstrap', err);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chats, activeChatId, loading]);

  const refreshChat = useCallback(async (chatId) => {
    try {
      const fresh = await api(`/api/chats/${chatId}`);
      setChats(prev => prev.map(c => c.id === chatId ? fresh : c));
    } catch (err) {
      console.error('refreshChat', err);
    }
  }, []);

  const createChat = useCallback(async (mode = 'auto') => {
    const created = await postJSON('/api/chats', { mode });
    const fresh = { ...created, messages: [] };
    setChats(prev => [fresh, ...prev]);
    setActiveChatId(created.id);
    return fresh;
  }, []);

  const selectChat = useCallback((chatId) => {
    setActiveChatId(chatId);
    setAgentStatus(null);
  }, []);

  const deleteChatById = useCallback(async (chatId) => {
    await api(`/api/chats/${chatId}`, { method: 'DELETE' });
    setChats(prev => prev.filter(c => c.id !== chatId));
    setActiveChatId(curr => curr === chatId ? null : curr);
  }, []);

  // Ensure active chat after delete (guarded by ensuringRef + bootstrapping flag)
  useEffect(() => {
    if (bootstrapping || ensuringRef.current) return;
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id);
    } else if (chats.length === 0) {
      ensuringRef.current = true;
      (async () => {
        try {
          const created = await postJSON('/api/chats', { mode: 'auto' });
          setChats([{ ...created, messages: [] }]);
          setActiveChatId(created.id);
        } catch (err) {
          console.error(err);
        } finally {
          ensuringRef.current = false;
        }
      })();
    }
  }, [chats, activeChatId, bootstrapping]);

  const changeMode = useCallback(async (newMode) => {
    if (!activeChat || activeChat.messages.length > 0) return;
    setChats(prev => prev.map(c => c.id === activeChat.id ? { ...c, mode: newMode } : c));
    try {
      await api(`/api/chats/${activeChat.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ mode: newMode })
      });
    } catch (err) {
      console.error('changeMode', err);
    }
  }, [activeChat]);

  const sendMessage = useCallback(async ({ userMessage, mode, documentId, imageId }) => {
    if (loading || !activeChatId) return;
    const text = (userMessage || '').trim();
    if (!text && !documentId && !imageId) return;
    setLoading(true);
    setAgentStatus(null);
    setToolEvents([]);

    const ac = new AbortController();
    abortControllerRef.current = ac;

    const tempUserMsg = { id: `tmp-u-${Date.now()}`, role: 'user', content: text };
    const tempAsstMsg = { id: `tmp-a-${Date.now()}`, role: 'assistant', content: '' };

    setChats(prev => prev.map(c =>
      c.id === activeChatId
        ? { ...c, messages: [...c.messages, tempUserMsg, tempAsstMsg] }
        : c
    ));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: activeChatId, userMessage: text, mode, documentId, imageId }),
        signal: ac.signal
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const ev = JSON.parse(data);
            if (ev.type === 'chunk' && ev.content) {
              accumulated += ev.content;
              setChats(prev => prev.map(c => {
                if (c.id !== activeChatId) return c;
                const msgs = [...c.messages];
                msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: accumulated };
                return { ...c, messages: msgs };
              }));
            } else if (ev.type === 'agent') {
              setAgentStatus({ intent: ev.intent, agent: ev.agent, router: ev.router });
            } else if (ev.type === 'status') {
              setAgentStatus({ message: ev.message });
            } else if (ev.type === 'tool_call') {
              setToolEvents(prev => [
                ...prev,
                { id: ev.id, name: ev.name, args: ev.args, status: 'running' }
              ]);
            } else if (ev.type === 'tool_result') {
              setToolEvents(prev => prev.map(t =>
                t.id === ev.id
                  ? { ...t, status: ev.ok ? 'done' : 'error', preview: ev.preview, error: ev.error }
                  : t
              ));
            } else if (ev.type === 'error') {
              accumulated = `[Error] ${ev.error}`;
              setChats(prev => prev.map(c => {
                if (c.id !== activeChatId) return c;
                const msgs = [...c.messages];
                msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: accumulated };
                return { ...c, messages: msgs };
              }));
            }
          } catch {
            // skip malformed line
          }
        }
      }

      await refreshChat(activeChatId);
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancel — refresh untuk dapat content yg sudah tersimpan di DB
        await refreshChat(activeChatId);
      } else {
        console.error('sendMessage', err);
        setChats(prev => prev.map(c => {
          if (c.id !== activeChatId) return c;
          const msgs = [...c.messages];
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `[Error] ${err.message}` };
          return { ...c, messages: msgs };
        }));
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [loading, activeChatId, refreshChat]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const renameChat = useCallback(async (chatId, newTitle) => {
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: newTitle } : c));
    try {
      await api(`/api/chats/${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: newTitle })
      });
    } catch (err) {
      console.error('renameChat', err);
    }
  }, []);

  const regenerate = useCallback(async () => {
    if (loading || !activeChat) return;
    // Cari pesan user terakhir + drop assistant terakhir
    const msgs = activeChat.messages;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    const lastUser = msgs[lastUserIdx];

    // Hapus pesan setelah lastUser di backend
    const toDelete = msgs.slice(lastUserIdx).filter(m => m.id && !String(m.id).startsWith('tmp'));
    await Promise.all(toDelete.map(m =>
      fetch(`/api/messages/${m.id}`, { method: 'DELETE' }).catch(() => {})
    ));
    // Refresh state
    await refreshChat(activeChatId);
    // Re-send dengan content user yang sama
    sendMessage({ userMessage: lastUser.content, mode: activeChat.mode });
  }, [loading, activeChat, activeChatId, refreshChat, sendMessage]);

  const editLastUserMessage = useCallback(async (newText) => {
    if (loading || !activeChat) return;
    const msgs = activeChat.messages;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;

    const toDelete = msgs.slice(lastUserIdx).filter(m => m.id && !String(m.id).startsWith('tmp'));
    await Promise.all(toDelete.map(m =>
      fetch(`/api/messages/${m.id}`, { method: 'DELETE' }).catch(() => {})
    ));
    await refreshChat(activeChatId);
    sendMessage({ userMessage: newText, mode: activeChat.mode });
  }, [loading, activeChat, activeChatId, refreshChat, sendMessage]);

  return {
    chats,
    activeChat,
    activeChatId,
    loading,
    bootstrapping,
    agentStatus,
    toolEvents,
    chatWindowRef,
    createChat,
    selectChat,
    deleteChat: deleteChatById,
    changeMode,
    sendMessage,
    stopGeneration,
    renameChat,
    regenerate,
    editLastUserMessage
  };
}

export default useChat;
