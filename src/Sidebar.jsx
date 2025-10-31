import React from 'react';
import './Sidebar.css'; 

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
            
            <button 
              className="delete-chat-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteChat(chat.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      
      {/* --- (UPGRADE) COPYRIGHT FOOTER --- */}
      <div className="sidebar-footer">
        <p>
          Dibuat oleh <a href="https://github.com/prastianhdd" target="_blank" rel="noopener noreferrer">
            PrastianHD
          </a>
        </p>
      </div>
      {/* --- AKHIR UPGRADE --- */}
    </div>
  );
}

export default Sidebar;