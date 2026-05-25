// Tools: web_search, wikipedia, arxiv, calculator, rag_search, save_memory, recall_memory

import { evaluate } from 'mathjs';
import { retrieve } from './rag.js';
import { saveMemory, searchMemories, listMemories } from './db.js';

const TAVILY_KEY = () => process.env.TAVILY_API_KEY || '';
const TAVILY_URL = 'https://api.tavily.com/search';

// ============ Tool implementations ============

async function webSearch({ query, max_results = 5, topic = 'general' }) {
  const key = TAVILY_KEY();
  if (!key) throw new Error('TAVILY_API_KEY not configured');

  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: 'advanced',
      include_answer: true,
      max_results: Math.min(max_results, 10),
      topic
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Tavily ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    answer: data.answer || null,
    results: (data.results || []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: (r.content || '').slice(0, 500),
      score: r.score,
      published: r.published_date || null
    }))
  };
}

async function wikipediaSearch({ query, lang = 'id' }) {
  // Fallback ke en kalau id sepi
  const tryLang = async (l) => {
    const url = `https://${l}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts|info&exintro=1&explaintext=1&inprop=url&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&origin=*`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
    return res.json();
  };

  let data = await tryLang(lang);
  if (!data.query?.pages && lang === 'id') {
    data = await tryLang('en');
  }
  const pages = data.query?.pages ? Object.values(data.query.pages) : [];
  return {
    results: pages.map(p => ({
      title: p.title,
      url: p.fullurl,
      extract: (p.extract || '').slice(0, 1500)
    }))
  };
}

async function arxivSearch({ query, max_results = 5 }) {
  const url = `http://export.arxiv.org/api/query?search_query=${encodeURIComponent('all:' + query)}&start=0&max_results=${Math.min(max_results, 10)}&sortBy=relevance`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`arXiv ${res.status}`);
  const xml = await res.text();

  // Cheap XML parse — arXiv Atom feed cukup regular
  const entries = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  const pick = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  };
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];
    const authors = [...block.matchAll(/<name>(.*?)<\/name>/g)].map(a => a[1]);
    entries.push({
      title: pick(block, 'title'),
      url: pick(block, 'id'),
      summary: pick(block, 'summary').slice(0, 800),
      authors: authors.slice(0, 5),
      published: pick(block, 'published').slice(0, 10)
    });
  }
  return { results: entries };
}

function calculator({ expression }) {
  try {
    const result = evaluate(expression);
    return {
      expression,
      result: typeof result === 'object' ? result.toString() : String(result)
    };
  } catch (err) {
    throw new Error(`Calculator error: ${err.message}`);
  }
}

async function ragSearch({ query, k = 5 }, ctx = {}) {
  const hits = await retrieve(query, Math.min(k, 10), ctx.userId || null);
  return {
    query,
    hits: hits.map(h => ({
      document: h.filename,
      chunkIndex: h.chunkIndex,
      similarity: Math.max(0, 1 - h.distance), // L2 → rough similarity
      excerpt: (h.text || '').slice(0, 800)
    }))
  };
}

async function saveMemoryTool({ content, tags = '' }, ctx = {}) {
  if (!content || !content.trim()) throw new Error('content required');
  const mem = await saveMemory({
    content: content.trim(),
    tags: (tags || '').trim(),
    userId: ctx.userId || null
  });
  return { ok: true, id: mem.id, content: mem.content };
}

async function recallMemoryTool({ query, limit = 5 }, ctx = {}) {
  const lim = Math.min(limit || 5, 20);
  const userId = ctx.userId || null;
  if (query && query.trim()) {
    return { hits: await searchMemories(query.trim(), lim, userId) };
  }
  const all = await listMemories(userId);
  return { hits: all.slice(0, lim) };
}

// ============ Schema (OpenAI tool format) ============

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Cari di web untuk informasi terkini, fakta yang perlu diverifikasi, berita, atau topik di luar pengetahuan dasar. Pakai untuk topik akademik yang butuh sumber terbaru. Hasil termasuk AI summary + 5 link.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query pencarian dalam bahasa Inggris (lebih banyak hasil) atau Indonesia.' },
          max_results: { type: 'integer', description: 'Jumlah hasil (default 5, max 10).', default: 5 },
          topic: { type: 'string', enum: ['general', 'news', 'finance'], description: 'Domain topik.', default: 'general' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wikipedia',
      description: 'Cari artikel Wikipedia. Berguna untuk definisi, konsep umum, dan latar belakang topik. Bukan sumber sitasi akademik utama, tapi titik awal yang baik.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Topik yang dicari.' },
          lang: { type: 'string', description: 'Bahasa kode (id, en). Default id, fallback en otomatis.', default: 'id' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'arxiv',
      description: 'Cari paper akademik di arXiv (preprint sains/CS/matematika/fisika). Hasilkan judul, penulis, abstrak, link. WAJIB untuk kajian literatur agar sumber terpercaya dan dapat disitasi.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query dalam bahasa Inggris (arXiv kebanyakan EN).' },
          max_results: { type: 'integer', description: 'Jumlah paper (default 5, max 10).', default: 5 }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculator',
      description: 'Evaluasi ekspresi matematika atau statistik (mathjs syntax). Pakai untuk hitungan presisi: persen, statistik, aljabar, kalkulus simbolik.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Ekspresi matematika, mis. "sqrt(2) * pi", "mean([1,2,3,4])", "(150-100)/100*100".' }
        },
        required: ['expression']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rag_search',
      description: 'Cari pasase paling relevan di dokumen yang sudah pengguna unggah (RAG). WAJIB dipakai kalau pengguna bertanya tentang isi dokumen yang lampirannya ada di session ini. Hasil = excerpt + nama file + similarity. Pakai sebelum web_search kalau pertanyaan kemungkinan terjawab di dokumen.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Pertanyaan/kata kunci semantik dalam bahasa apa pun.' },
          k: { type: 'integer', description: 'Jumlah passage (default 5, max 10).', default: 5 }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: 'Simpan informasi penting tentang pengguna untuk diingat lintas-sesi (preferensi, fakta personal, konteks proyek, gaya tulisan). Pakai setelah pengguna berbagi info yang patut diingat. Jangan simpan trivia.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Fakta/preferensi yang akan disimpan.' },
          tags: { type: 'string', description: 'Tag pemisah koma (mis. "preferensi, gaya-tulis").' }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recall_memory',
      description: 'Ambil memori yang relevan dengan pertanyaan/topik saat ini. Pakai di awal sesi atau saat pengguna menyinggung hal yang mungkin pernah didiskusikan.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Topik/kata kunci. Kosongkan untuk daftar terbaru.' },
          limit: { type: 'integer', description: 'Jumlah memori (default 5).', default: 5 }
        }
      }
    }
  }
];

// ============ Dispatcher ============

const HANDLERS = {
  web_search: webSearch,
  wikipedia: wikipediaSearch,
  arxiv: arxivSearch,
  calculator,
  rag_search: ragSearch,
  save_memory: saveMemoryTool,
  recall_memory: recallMemoryTool
};

export async function executeTool(name, args, ctx = {}) {
  const handler = HANDLERS[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  return handler(args || {}, ctx);
}

export const TOOL_NAMES = Object.keys(HANDLERS);
