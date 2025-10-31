import React from 'react';

// Sidebar.css akan kita buat di langkah berikutnya
import './Sidebar.css'; 

function Sidebar({ allChats, activeChatId, onSelectChat, onNewChat }) {
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
            // Terapkan kelas 'active' jika ID-nya cocok
            className={`chat-list-item ${chat.id === activeChatId ? 'active' : ''}`}
            onClick={() => onSelectChat(chat.id)}
          >
            {/* Tampilkan judul chat, potong jika terlalu panjang */}
            <p>{chat.title.substring(0, 30)}{chat.title.length > 30 ? '...' : ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Sidebar;