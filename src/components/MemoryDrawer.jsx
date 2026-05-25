import { useEffect, useState, useCallback } from 'react';

export default function MemoryDrawer({ open, onClose }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/memories');
      if (res.ok) setMemories(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleDelete = async (id) => {
    await fetch(`/api/memories/${id}`, { method: 'DELETE' });
    refresh();
  };

  if (!open) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="memory-drawer">
        <header className="memory-drawer__header">
          <h2>Memori</h2>
          <button type="button" className="memory-drawer__close" onClick={onClose} aria-label="Tutup">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <div className="memory-drawer__body">
          {loading && <p className="memory-drawer__empty">Memuat…</p>}
          {!loading && memories.length === 0 && (
            <p className="memory-drawer__empty">
              Belum ada memori. Asisten akan menyimpan info penting tentang Anda di sini saat berbicara.
            </p>
          )}
          {memories.map(m => (
            <div key={m.id} className="memory-item">
              <div className="memory-item__content">{m.content}</div>
              <div className="memory-item__meta">
                {m.tags && <span className="memory-item__tags">{m.tags}</span>}
                <button
                  type="button"
                  className="memory-item__delete"
                  onClick={() => handleDelete(m.id)}
                  aria-label="Hapus memori"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
