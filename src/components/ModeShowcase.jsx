import { useState } from 'react';

const MODES = [
  {
    id: 'auto',
    label: 'Otomatis',
    tagline: 'Asisten serbaguna untuk pertanyaan harian.',
    prompt: 'Jelaskan transformer architecture singkat dengan analogi.',
    output: {
      type: 'paragraphs',
      content: [
        'Bayangkan ruang baca dengan banyak orang. Setiap kalimat masuk, dan tiap orang fokus ke kata berbeda — ada yang ke subjek, ada yang ke konteks.',
        'Transformer bekerja begitu: lewat *self-attention*, model menghitung relasi antar-kata sekaligus, bukan satu per satu seperti RNN.'
      ]
    }
  },
  {
    id: 'research',
    label: 'Riset',
    tagline: 'Kajian literatur dengan sumber terverifikasi.',
    prompt: 'Tinjauan singkat teknik fine-tuning LLM 2024-2026.',
    output: {
      type: 'research',
      content: {
        intro: 'Fine-tuning LLM bergeser dari full-tuning ke metode parameter-efficient.',
        bullets: [
          'LoRA (Hu et al., 2021) tetap dominan untuk task-spesifik.',
          'QLoRA (Dettmers et al., 2023) memungkinkan training 65B di GPU tunggal.',
          'DPO (Rafailov et al., 2023) menggantikan RLHF sebagai pipeline alignment standar.'
        ],
        sources: ['arxiv.org', 'aclanthology.org', 'nature.com']
      }
    }
  },  {
    id: 'summary',
    label: 'Ringkas',
    tagline: 'Lampirkan PDF, dapat ringkasan terstruktur.',
    prompt: 'Ringkas paper "Attention Is All You Need".',
    output: {
      type: 'summary',
      content: {
        attachment: 'attention-is-all-you-need.pdf',
        sections: [
          { title: 'Inti', text: 'Arsitektur baru tanpa rekurensi/konvolusi, hanya berbasis attention.' },
          { title: 'Metode', text: 'Encoder-decoder dengan multi-head self-attention + positional encoding.' },
          { title: 'Hasil', text: 'BLEU 28.4 pada WMT-14 EN-DE, training 12 jam di 8 GPU — jauh lebih cepat dari baseline.' }
        ]
      }
    }
  },
  {
    id: 'paraphrase',
    label: 'Parafrasa',
    tagline: 'Tulis ulang dengan struktur dan diksi berbeda.',
    prompt: 'Parafrasa: "Penelitian ini menggunakan metode kuantitatif."',
    output: {
      type: 'paraphrase',
      content: {
        before: 'Penelitian ini menggunakan metode kuantitatif untuk menganalisis hubungan antar variabel.',
        after: 'Untuk mengkaji keterkaitan antar variabel, kajian ini ditempuh melalui pendekatan kuantitatif.'
      }
    }
  }
];

export default function ModeShowcase() {
  const [active, setActive] = useState('auto');
  const mode = MODES.find(m => m.id === active);

  return (
    <section className="landing-modes" id="mode">
      <div className="landing-modes__inner">
        <div className="landing-modes__header">
          <h2 className="landing-section-title">Empat mode, satu chat.</h2>
          <p className="landing-modes__lede">
            Pilih dari composer di kiri-bawah. Setiap mode memilih agent dan tool berbeda di balik layar.
          </p>
        </div>

        <div className="mode-tabs" role="tablist" aria-label="Mode showcase">
          {MODES.map(m => (
            <button
              key={m.id}
              role="tab"
              type="button"
              aria-selected={active === m.id}
              className={`mode-tab ${active === m.id ? 'mode-tab--active' : ''}`}
              onClick={() => setActive(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="mode-panel" role="tabpanel">
          <div className="mode-panel__copy">
            <span className="mode-panel__label">Mode {mode.label}</span>
            <p className="mode-panel__tagline">{mode.tagline}</p>
            <div className="mode-panel__prompt">
              <span className="mode-panel__prompt-label">Prompt</span>
              <span className="mode-panel__prompt-text">{mode.prompt}</span>
            </div>
          </div>

          <div className="mode-panel__output">
            <ModeOutput mode={mode} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ModeOutput({ mode }) {
  const out = mode.output;
  switch (out.type) {
    case 'paragraphs':
      return (
        <div className="mode-out">
          <div className="mode-out__chip">
            <span className="mode-out__chip-dot" /> Asisten chat
          </div>
          {out.content.map((p, i) => <p key={i} className="mode-out__p">{p}</p>)}
        </div>
      );

    case 'research':
      return (
        <div className="mode-out">
          <div className="mode-out__chip mode-out__chip--success">
            <span>✓</span> arXiv · web search
          </div>
          <p className="mode-out__p">{out.content.intro}</p>
          <ul className="mode-out__list">
            {out.content.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          <div className="mode-out__sources">
            {out.content.sources.map(s => (
              <span key={s} className="mode-out__source-pill">{s}</span>
            ))}
          </div>
        </div>
      );

    case 'summary':
      return (
        <div className="mode-out">
          <div className="mode-out__attachment">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span>{out.content.attachment}</span>
          </div>
          {out.content.sections.map((s) => (
            <div key={s.title} className="mode-out__section">
              <h4 className="mode-out__h4">{s.title}</h4>
              <p className="mode-out__p">{s.text}</p>
            </div>
          ))}
        </div>
      );

    case 'paraphrase':
      return (
        <div className="mode-out">
          <div className="mode-out__paraphrase">
            <div className="mode-out__pp mode-out__pp--before">
              <span className="mode-out__pp-label">Sebelum</span>
              <p>{out.content.before}</p>
            </div>
            <div className="mode-out__pp-arrow" aria-hidden="true">→</div>
            <div className="mode-out__pp mode-out__pp--after">
              <span className="mode-out__pp-label">Sesudah</span>
              <p>{out.content.after}</p>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}
