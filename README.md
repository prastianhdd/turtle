# Turtle

Antarmuka chat privat untuk akses Claude Opus 4.7 (atau LLM lain via endpoint OpenAI-compatible) tanpa rate limit Web UI. Bukan asisten akademik — asisten serbaguna dengan tool use, RAG dokumen, citation grounding, vision, memory lintas-sesi, dan artifact preview.

## Highlight

- **Model**: Claude Opus 4.7 / Sonnet 4.6 / model lain via OpenAI-compatible endpoint (Kiro, OpenRouter, Ollama Cloud, dll). Ganti via `OLLAMA_BASE_URL` + `OLLAMA_MODEL`.
- **Tool use multi-step**: Web Search (Tavily), Wikipedia, arXiv, Calculator (mathjs), RAG search, Save/Recall Memory.
- **RAG dokumen**: Upload PDF/TXT/MD → auto chunk → embed → Postgres pgvector cosine search.
- **Citation cards**: Auto-detect URL di output → render kartu sumber dengan favicon.
- **Vision**: Upload PNG/JPEG/WebP/GIF → multimodal content array ke model.
- **Memory cross-session**: Asisten panggil `save_memory` saat user kasih info penting, `recall_memory` di awal sesi.
- **Artifacts**: ` ```html ` / ` ```svg ` / ` ```mermaid ` di markdown → live preview iframe sandbox.
- **Auth password**: Halaman login HMAC-signed cookie 7-day, tanpa DB session.
- **Mobile-first**: 100dvh, safe-area inset, body-scroll lock saat drawer, tap target 40px.
- **Streaming UX**: Caret blinking, tombol Stop (AbortController), Regenerate, Edit message, smart auto-scroll, "pesan baru" pill.

## Teknologi

| Layer | Tech |
|---|---|
| Frontend | React 19 (Vite), react-markdown + remark-gfm + remark-math + rehype-katex, react-syntax-highlighter, mermaid, KaTeX |
| Backend | Express 5 (Node 18+), express-rate-limit, cookie-parser, multer |
| LLM | Endpoint OpenAI-compatible (default Kiro/Ollama-style `/v1/chat/completions`) |
| Embedding | `/v1/embeddings` di endpoint yang sama (default `bge-m3` 1024-dim) |
| Database | Neon Postgres (serverless) + pgvector HNSW cosine |
| PDF | unpdf (modern, no native deps) |
| Tools | Tavily, mathjs, fetch native untuk Wikipedia + arXiv API |
| Auth | HMAC-SHA256 signed cookie, 7-day TTL |

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```env
# LLM
OLLAMA_API_KEY=sk-xxx-your-key
OLLAMA_BASE_URL=https://your-endpoint/v1
OLLAMA_MODEL=claude-opus-4-7

# Web search
TAVILY_API_KEY=tvly-your-key

# Database (Neon)
DATABASE_URL=postgresql://user:pass@host.neon.tech/dbname?sslmode=require
EMBED_DIM=1024
EMBED_MODEL=bge-m3

# Auth
ACCESS_PASSWORD=password_kuat_anda
AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Site
SITE_URL=http://localhost:5173
PORT=3000
```

Generate `AUTH_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run dev (frontend + backend):
```bash
npm run dev:all
```

Buka http://localhost:5173, login dengan `ACCESS_PASSWORD`.

## Mode

Pilih dari composer (kiri):

- **Otomatis** — chat agent serbaguna dengan akses semua tool.
- **Riset** — researcher agent, pakai web/arxiv/wiki untuk grounding.
- **Ringkas** — summarizer agent, butuh dokumen terlampir.
- **Parafrasa** — paraphraser agent, anti-deteksi AI.

## Arsitektur

```
src/
├── App.jsx               # Auth gate + AppShell
├── Sidebar.jsx           # Chat list + projects + memory + logout
├── components/
│   ├── ChatWindow.jsx    # Smart auto-scroll, scroll-pill, suggestions
│   ├── MessageBubble.jsx # Markdown + GFM + math + mermaid + artifacts + actions
│   ├── ChatInput.jsx     # Composer dengan mode chips + file/image upload
│   ├── ArtifactBlock.jsx # iframe sandbox preview/code tab
│   ├── MermaidBlock.jsx  # Mermaid renderer
│   ├── SourcesFooter.jsx # Citation card grid
│   ├── MemoryDrawer.jsx  # Memory list panel
│   ├── Login.jsx         # Login page
│   └── Toast.jsx         # Toast provider
└── hooks/
    ├── useChat.js        # Server-backed state, AbortController, regenerate, edit
    ├── useTheme.js       # Light/dark
    └── useAuth.js        # Login/logout/status

api/
├── auth.js               # HMAC cookie, login/logout/status, requireAuth middleware
├── db.js                 # Neon Postgres pool + pgvector + 7 tables
├── llm.js                # OpenAI-compatible client (complete, streamComplete, toolLoop)
├── embeddings.js         # Embedding client (batch, retry)
├── rag.js                # Chunker (800/150) + ingest + retrieve
├── orchestrator.js       # Mode router → agent → tool loop → SSE stream
├── chat.js               # Thin /api/chat handler
├── upload.js             # PDF (unpdf) + image upload
├── tools.js              # 7 tools: web_search/wikipedia/arxiv/calculator/rag_search/save_memory/recall_memory
└── agents/
    ├── chat.js
    ├── literature-reviewer.js
    ├── summarizer.js
    └── paraphraser.js

server.js                 # Express, CORS, rate limit, auth gate, routes
```

## Database schema

Auto-migrate saat startup (idempotent):

- `chats` (id, title, mode, project_id, timestamps)
- `messages` (id, chat_id FK, role, content, created_at)
- `documents` (id, chat_id, filename, mime_type, char_count, text)
- `document_chunks` (chunk_index, text, char_start/end, **embedding vector(1024)**)
- `images` (id, chat_id, filename, mime_type, data_url)
- `memories` (id, content, tags, timestamps)
- `projects` (id, name, description)

HNSW index pada `document_chunks.embedding` dengan `vector_cosine_ops`.

## Routes

```
GET    /api/health                      # public
GET    /api/auth/status                 # public
POST   /api/auth/login                  # public, rate-limited 8/min
POST   /api/auth/logout                 # public
                                        # ↓ semua di bawah butuh cookie auth
GET    /api/chats
POST   /api/chats
GET    /api/chats/:id
PATCH  /api/chats/:id
DELETE /api/chats/:id
DELETE /api/messages/:id
POST   /api/chat                        # rate 20/min, SSE streaming
POST   /api/upload                      # rate 10/min, PDF/TXT/MD
POST   /api/upload-image                # rate 10/min, image
GET/DELETE /api/documents/:id
GET/DELETE /api/images/:id
GET/POST/PATCH/DELETE /api/projects[/:id]
POST   /api/chats/:id/project
GET    /api/memories
DELETE /api/memories/:id
```

## SSE event types

Saat POST `/api/chat`:

```
{ type: 'agent', intent, agent, router }    # agent dipilih
{ type: 'meta', userMessageId, assistantMessageId }
{ type: 'tool_call', id, name, args }       # tool dipanggil
{ type: 'tool_result', id, name, ok, preview }
{ type: 'chunk', content }                  # streaming text
{ type: 'done' }
{ type: 'error', error }
data: [DONE]
```

## Deployment

**Recommended (hybrid):** Frontend Vercel (static Vite), backend Railway/Fly/VPS untuk Node Express.

**Full Vercel:** Pasang `vercel.json` + adapt route handlers ke Vercel function format. Watch out timeout (Hobby 10s, Pro 60s, Edge 300s) — tool loop multi-step bisa overrun.

## Scripts

```bash
npm run dev          # frontend Vite saja
npm run server       # backend Express saja
npm run dev:all      # frontend + backend (concurrently)
npm run build        # production build
npm run lint         # eslint frontend + backend
npm run preview      # preview production build
```

## Konfigurasi mode advanced

- `EMBED_DIM` — match dengan model embedding (bge-m3=1024, text-embedding-3-small=1536, 3-large=3072). Drop DB kalau ganti dimensi.
- `MAX_DOC_CHARS` di `orchestrator.js` — default 60k, batas konteks dokumen.
- `MAX_HISTORY_MESSAGES` — default 30, window history.
- `MAX_TOOL_ITERATIONS` di `llm.js` — default 6, batas tool loop.
- `MAX_CHUNKS_PER_DOC` di `rag.js` — default 200.

## Security notes

- `ACCESS_PASSWORD` kosong = auth disabled (publik). Jangan deploy publik tanpa password.
- `AUTH_SECRET` wajib random 32+ byte di prod. Cookie sign HMAC-SHA256.
- CORS allowlist dari `SITE_URL`. Origin lain ditolak (kecuali no-origin server-to-server).
- Rate limit: login 8/min, chat 20/min, upload 10/min.
- API key LLM/Tavily/DB hanya di server, tidak pernah ke client.
- File `.env` di-gitignore. JANGAN commit credential.

## Lisensi

Personal/educational use. Bukan official Anthropic / Claude product.

## Credit

Dibuat oleh [PrastianHD](https://github.com/prastianhdd).
