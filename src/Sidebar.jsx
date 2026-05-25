import { useMemo, useState, useEffect, useCallback } from 'react';
import SpikeMark from './components/SpikeMark';
import { useToast } from './components/Toast';

function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  isOpen,
  onClose,
  onOpenMemory,
  onLogout
}) {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [search, setSearch] = useState('');

  const refreshProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) setProjects(await res.json());
    } catch (err) {
      console.error('projects', err);
    }
  }, []);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        setNewProjectName('');
        setShowProjectForm(false);
        refreshProjects();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProject = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Hapus proyek? Chat di dalamnya tidak ikut terhapus.')) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    refreshProjects();
    toast.success('Proyek dihapus');
  };

  const groupedChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? chats.filter(c => (c.title || '').toLowerCase().includes(q))
      : chats;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;
    const thirtyDays = 30 * oneDay;
    const groups = { today: [], yesterday: [], previous7Days: [], previous30Days: [], older: [] };
    filtered.forEach(chat => {
      const age = now - (chat.createdAt || now);
      if (age < oneDay) groups.today.push(chat);
      else if (age < 2 * oneDay) groups.yesterday.push(chat);
      else if (age < sevenDays) groups.previous7Days.push(chat);
      else if (age < thirtyDays) groups.previous30Days.push(chat);
      else groups.older.push(chat);
    });
    return groups;
  }, [chats, search]);

  const renderGroup = (title, groupChats) => {
    if (groupChats.length === 0) return null;
    return (
      <div className="sidebar-group">
        <h3 className="sidebar-group-title">{title}</h3>
        {groupChats.map(chat => (
          <div
            key={chat.id}
            className={`chat-list-item ${chat.id === activeChatId ? 'active' : ''}`}
            onClick={() => onSelectChat(chat.id)}
          >
            <span className="chat-item-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </span>
            <span className="chat-item-title">{chat.title}</span>
            <button
              className="delete-chat-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteChat(chat.id);
              }}
              aria-label="Hapus chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <SpikeMark className="sidebar-brand__glyph" size={18} />
            <span className="sidebar-brand__name">Turtle</span>
          </div>
          <button className="new-chat-btn" onClick={onNewChat}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Chat Baru</span>
          </button>

          <div className="sidebar-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari chat…"
              aria-label="Cari chat"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Hapus cari">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="sidebar-content">
          {/* Projects section */}
          <div className="sidebar-group">
            <div className="sidebar-group-header">
              <h3 className="sidebar-group-title">Proyek</h3>
              <button
                type="button"
                className="sidebar-group-action"
                onClick={() => setShowProjectForm(v => !v)}
                aria-label="Tambah proyek"
              >
                +
              </button>
            </div>
            {showProjectForm && (
              <form className="project-form" onSubmit={handleCreateProject}>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Nama proyek…"
                  autoFocus
                />
                <button type="submit">OK</button>
              </form>
            )}
            {projects.map(p => (
              <div key={p.id} className="project-item">
                <span className="project-item__icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </span>
                <span className="project-item__name">{p.name}</span>
                <button
                  className="delete-chat-btn"
                  onClick={(e) => handleDeleteProject(p.id, e)}
                  aria-label="Hapus proyek"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {renderGroup('Hari ini', groupedChats.today)}
          {renderGroup('Kemarin', groupedChats.yesterday)}
          {renderGroup('7 Hari Terakhir', groupedChats.previous7Days)}
          {renderGroup('30 Hari Terakhir', groupedChats.previous30Days)}
          {renderGroup('Lebih Lama', groupedChats.older)}
        </div>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-footer-btn" onClick={onOpenMemory}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Memori</span>
          </button>
          {onLogout && (
            <button type="button" className="sidebar-footer-btn" onClick={onLogout}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>Keluar</span>
            </button>
          )}
          <p>
            Dibuat oleh{' '}
            <a href="https://github.com/prastianhdd" target="_blank" rel="noopener noreferrer">
              PrastianHD
            </a>
          </p>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
