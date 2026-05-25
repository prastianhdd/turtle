import { useState, useRef, useEffect } from 'react';
import { useToast } from './Toast';
import { authHeaders } from '../hooks/useAuth';

const MODE_PLACEHOLDER = {
  auto: 'Tanya apa saja ke Opus 4.7…',
  research: 'Topik yang mau diriset mendalam…',
  summary: 'Lampirkan PDF lalu beri instruksi (opsional)…',
  paraphrase: 'Tempel teks yang ingin diparafrasa…',
  chat: 'Tulis pertanyaan atau follow-up…'
};

const MODES = [
  { id: 'auto',       label: 'Otomatis' },
  { id: 'research',   label: 'Riset' },
  { id: 'summary',    label: 'Ringkas' },
  { id: 'paraphrase', label: 'Parafrasa' }
];

function formatCharCount(n) {
  if (n < 1000) return `${n} chars`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k chars`;
  return `${Math.round(n / 1000)}k chars`;
}

function ChatInput({ mode, onSubmit, loading, onModeChange, onStop }) {
  const toast = useToast();
  const [input, setInput] = useState('');
  const [document, setDocument] = useState(null);
  const [image, setImage] = useState(null); // {id, filename, dataUrl?}
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (loading || uploading) return;

    const text = input.trim();
    if (mode === 'summary' && !document) return;
    if (mode !== 'summary' && !text && !document && !image) return;

    onSubmit({
      userMessage: text || (document ? `(dokumen: ${document.filename})` : (image ? `(gambar: ${image.filename})` : '')),
      mode,
      documentId: document?.id || null,
      imageId: image?.id || null
    });
    setInput('');
    setDocument(null);
    setImage(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'text/plain', 'text/markdown'];
    if (!allowed.includes(file.type) && !/\.(pdf|txt|md)$/i.test(file.name)) {
      toast.error('Hanya PDF, TXT, atau MD yang didukung.');
      e.target.value = null;
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData, headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload gagal (${res.status})`);
      }
      const doc = await res.json();
      setDocument({ id: doc.id, filename: doc.filename, charCount: doc.charCount });
      toast.success(`${doc.filename} terunggah`);
    } catch (err) {
      toast.error(`Gagal mengunggah: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      toast.error('Format gambar: PNG, JPEG, WebP, atau GIF.');
      e.target.value = null;
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData, headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload gambar gagal (${res.status})`);
      }
      const img = await res.json();
      const reader = new FileReader();
      reader.onload = () => setImage({ id: img.id, filename: img.filename, preview: reader.result });
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error(`Gagal mengunggah gambar: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  const removeDocument = () => setDocument(null);
  const removeImage = () => setImage(null);

  const disabled = loading || uploading;
  const canSubmit = mode === 'summary'
    ? Boolean(document) && !disabled
    : (Boolean(input.trim()) || Boolean(document) || Boolean(image)) && !disabled;

  return (
    <form className="chat-input-form" onSubmit={handleSubmit}>
      <div className="composer">
        {document && (
          <div className="composer-attachment">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span className="composer-attachment__name">{document.filename}</span>
            <span className="composer-attachment__meta">{formatCharCount(document.charCount)}</span>
            <button type="button" className="composer-attachment__remove" onClick={removeDocument} aria-label="Hapus lampiran">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        )}

        {image && (
          <div className="composer-attachment composer-attachment--image">
            {image.preview && <img src={image.preview} alt={image.filename} className="composer-attachment__thumb" />}
            <span className="composer-attachment__name">{image.filename}</span>
            <button type="button" className="composer-attachment__remove" onClick={removeImage} aria-label="Hapus gambar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={uploading ? 'Mengunggah…' : (MODE_PLACEHOLDER[mode] || MODE_PLACEHOLDER.auto)}
          disabled={disabled}
          rows={1}
          className="composer-textarea"
        />

        <div className="composer-actions">
          <div className="composer-modes" role="tablist" aria-label="Mode asisten">
            {MODES.map(m => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                className={`composer-mode ${mode === m.id ? 'composer-mode--active' : ''}`}
                onClick={() => onModeChange?.(m.id)}
                disabled={disabled}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="composer-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label="Lampirkan dokumen"
            title="Lampirkan PDF / TXT / MD"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md" onChange={handleFileChange} disabled={disabled} hidden />

          <button
            type="button"
            className="composer-btn"
            onClick={() => imageInputRef.current?.click()}
            disabled={disabled}
            aria-label="Lampirkan gambar"
            title="Lampirkan gambar (PNG/JPEG/WebP/GIF)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </button>
          <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageChange} disabled={disabled} hidden />

          <button
            type={loading ? 'button' : 'submit'}
            onClick={loading ? onStop : undefined}
            disabled={loading ? false : !canSubmit}
            className={`send-btn ${loading ? 'send-btn--stop' : ''}`}
            aria-label={loading ? 'Hentikan' : 'Kirim'}
          >
            {loading ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

export default ChatInput;
