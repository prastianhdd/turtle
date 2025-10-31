import React from 'react';
import './Sidebar.css'; 

// Ambil 'onClose' dari props (yang akan di-pass dari setIsSidebarOpen(false))
function Sidebar({ allChats, activeChatId, onSelectChat, onNewChat, onDeleteChat }) {
  
  // Fungsi 'onClose' akan dijalankan oleh tombol 'Tutup' dan overlay
  // Kita dapat mengambilnya dari App.jsx, tapi untuk sekarang kita gunakan onSelectChat
  // yang sudah dimodifikasi untuk menutup sidebar.
  // Mari kita tambahkan tombol tutup yang eksplisit.

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button onClick={onNewChat} className="new-chat-btn-sidebar">
          + Percakapan Baru
        </button>
        {/* --- (UPGRADE 3) Tombol Tutup Sidebar (Mobile) --- */}
        {/* Kita akan menggunakan CSS untuk menyembunyikannya di desktop */}
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
    </div>
  );
}

// Catatan: Tombol "Tutup" (×) di header sidebar bisa ditambahkan,
// tapi karena kita sudah punya overlay, itu jadi opsional.
// Kita akan fokus pada CSS untuk menyembunyikan/menampilkan sidebar.

export default Sidebar;