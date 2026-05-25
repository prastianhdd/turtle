import { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';
import SpikeMark from './SpikeMark';

function Header({ title, onMenuClick, isDark, onToggleTheme, onTitleChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  useEffect(() => { setDraft(title); }, [title]);

  const submit = () => {
    const v = draft.trim();
    if (v && v !== title) onTitleChange?.(v);
    else setDraft(title);
    setEditing(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { setDraft(title); setEditing(false); }
  };

  return (
    <header className="app-header">
      <button className="menu-btn" onClick={onMenuClick} aria-label="Toggle sidebar">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div className="brand-mark">
        <SpikeMark className="brand-mark__glyph" size={18} />
        <span className="brand-mark__name">Turtle</span>
      </div>

      {editing ? (
        <input
          type="text"
          className="header-title-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={submit}
          autoFocus
        />
      ) : (
        <h1
          className={`header-title ${onTitleChange ? 'editable' : ''}`}
          onClick={() => onTitleChange && setEditing(true)}
          title={onTitleChange ? 'Klik untuk edit judul' : ''}
        >
          {title}
        </h1>
      )}

      <div className="header-actions">
        <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
      </div>
    </header>
  );
}

export default Header;
