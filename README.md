# Gemini AI Science (Asisten Riset & Chat)
Aplikasi web ini adalah antarmuka chat kustom yang aman dan canggih untuk Google Gemini API. Proyek ini berevolusi dari frontend sederhana menjadi aplikasi full-stack mini yang di-hosting di Vercel, lengkap dengan backend serverless yang aman dan dua mode AI yang berbeda.

Lihat Demo Langsung : [website
](https://www.geminilabweb.site/)
## Fitur Utama

1. Mode Asisten Riset: Menggunakan model gemini-2.5-pro yang kuat dan  system kustom yang mendalam untuk penelitian akademis.

2. Mode Chat Normal: Menggunakan model gemini-2.5-pro  untuk percakapan umum.

3. Antarmuka Multi-Chat: Pengguna dapat mengelola beberapa percakapan sekaligus, mirip dengan Gemini atau ChatGPT asli.

4. Riwayat Persisten: Riwayat obrolan secara otomatis disimpan ke localStorage peramban, sehingga tidak hilang saat di-refresh.

## Desain Responsif (Mobile-First):

* Sidebar di desktop untuk navigasi yang mudah.
* Streaming Respons Real-time: Jawaban dari AI ditampilkan kata demi kata , tidak perlu menunggu respons penuh.

## Fitur Kualitas Hidup (QoL):

* Hapus Percakapan: Pengguna dapat menghapus chat lama dari sidebar.

* Salin Respons: Tombol "Salin" yang mudah di setiap bubble respons AI.

* Animasi Halus: Transisi dan animasi fade-in yang mulus untuk bubble obrolan dan perpindahan chat.

## Teknologi yang Digunakan

- Frontend: React (Vite), React Markdown
- Backend: Vercel Serverless Functions (Node.js)
- API: Google Gemini (Generative AI)
- Deployment: Vercel
- Styling: CSS Murni (dengan Flexbox, Grid, dan Media Queries)
