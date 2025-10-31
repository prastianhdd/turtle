import React from 'react';
import './Sidebar.css'; 

// --- (UPGRADE 1) Ambil 'onDeleteChat' dari props ---
function Sidebar({ allChats, activeChatId, onSelectChat, onNewChat, onDeleteChat }) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button onClick={onNewChat} className="new-chat-btn-sidebar">
          + Percakapan Baru
        </button>
      </div>
      <div className="sidebar-chat-list">
        {allChats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-list-item ${chat.id === activeChatId ? 'active' : ''}`}
            onClick={() => onSelectChat(chat.id)}
          >
            <p>{chat.title.substring(0, 30)}{chat.title.length > 30 ? '...' : ''}</p>
            
            {/* --- (UPGRADE 1) Tombol Hapus --- */}
            <button 
              className="delete-chat-btn"
              onClick={(e) => {
                e.stopPropagation(); // Hentikan klik agar tidak pindah chat
                onDeleteChat(chat.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Sidebar;