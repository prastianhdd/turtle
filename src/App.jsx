import { useState } from 'react';
import model from './gemini.js'; // Impor model yang sudah dikonfigurasi
import './App.css'; 

function App() {
  const [history, setHistory] = useState([]); 
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  // Fungsi untuk menginisialisasi chat baru DENGAN histori sebelumnya
  const startChatSession = () => {
    return model.startChat({
      history: history, // Menyertakan semua percakapan sebelumnya
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt) return;

    setLoading(true);
    
    // Tambahkan prompt pengguna ke histori lokal
    const userMessage = { role: 'user', parts: [{ text: prompt }] };
    const updatedHistory = [...history, userMessage];
    setHistory(updatedHistory); // Tampilkan pesan pengguna segera

    try {
      // Buat sesi chat baru DENGAN histori yang diperbarui
      const chat = startChatSession();

      // Kirim pesan baru (prompt)
      const result = await chat.sendMessage(prompt);
      const response = await result.response;
      const text = response.text();

      // Tambahkan respons model ke histori
      const modelMessage = { role: 'model', parts: [{ text: text }] };
      setHistory([...updatedHistory, modelMessage]); // Update histori dengan respons model

    } catch (error) {
      console.error("Error sending message:", error);
      // Opsional: Tampilkan pesan error ke pengguna
      const errorMessage = { role: 'model', parts: [{ text: "Maaf, terjadi kesalahan saat memproses permintaan Anda." }] };
      setHistory([...updatedHistory, errorMessage]);
    } finally {
      setPrompt(''); // Kosongkan input
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        {/* MODIFIKASI: Judul diubah agar sesuai peran */}
        <h1>Asisten Riset Akademik</h1>
      </header>
      
      <div className="chat-window">
        {history.map((msg, index) => (
          <div key={index} className={`chat-bubble ${msg.role}`}>
            <p>{msg.parts[0].text}</p>
          </div>
        ))}
        {loading && <div className="chat-bubble model loading">...</div>}
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          /* MODIFIKASI: Placeholder diubah agar sesuai peran */
          placeholder="Masukkan topik penelitian (misal: Rangkum materi Web3)"
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Meneliti...' : 'Kirim'}
        </button>
      </form>
    </div>
  );
}

export default App;