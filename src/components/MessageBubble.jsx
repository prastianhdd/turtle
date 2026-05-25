import { lazy, Suspense, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import SourcesFooter from './SourcesFooter';

// Lazy: dipanggil hanya kalau ada code block / mermaid block.
const SyntaxHighlighter = lazy(async () => {
  const [{ Prism }, styleMod] = await Promise.all([
    import('react-syntax-highlighter'),
    import('react-syntax-highlighter/dist/esm/styles/prism/one-dark')
  ]);
  return {
    default: (props) => <Prism {...props} style={styleMod.default} />
  };
});

const MermaidBlock = lazy(() => import('./MermaidBlock'));
const ArtifactBlock = lazy(() => import('./ArtifactBlock'));

function CodeBlock({ inline, className, children }) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, '');
  const match = /language-(\w+)/.exec(className || '');
  const lang = match?.[1];

  if (inline) {
    return <code className={className}>{children}</code>;
  }

  if (lang === 'mermaid') {
    return (
      <Suspense fallback={<div className="mermaid-block">Memuat diagram…</div>}>
        <MermaidBlock chart={text} />
      </Suspense>
    );
  }

  if (lang === 'html' || lang === 'svg' || lang === 'artifact') {
    const kind = lang === 'svg' ? 'svg' : 'html';
    return (
      <Suspense fallback={<div className="artifact-block">Memuat artifact…</div>}>
        <ArtifactBlock kind={kind} source={text} />
      </Suspense>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Plain text / markdown / no-language → render lembut, tanpa dark theme
  const PLAIN_LANGS = ['text', 'plaintext', 'plain', 'txt', 'md', 'markdown', 'output'];
  const isPlain = !lang || PLAIN_LANGS.includes(lang.toLowerCase());

  if (isPlain) {
    return (
      <div className="code-block code-block--plain">
        <div className="code-block__header">
          <span className="code-block__lang">{lang || 'text'}</span>
          <button type="button" className="code-block__copy" onClick={handleCopy}>
            {copied ? 'Disalin' : 'Salin'}
          </button>
        </div>
        <pre className="code-block__plain"><code>{text}</code></pre>
      </div>
    );
  }

  return (
    <div className="code-block">
      <div className="code-block__header">
        <span className="code-block__lang">{lang}</span>
        <button type="button" className="code-block__copy" onClick={handleCopy}>
          {copied ? 'Disalin' : 'Salin'}
        </button>
      </div>
      <Suspense fallback={<pre className="code-block__fallback">{text}</pre>}>
        <SyntaxHighlighter
          language={lang}
          PreTag="div"
          customStyle={{ margin: 0, borderRadius: 0, background: 'transparent' }}
          codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
        >
          {text}
        </SyntaxHighlighter>
      </Suspense>
    </div>
  );
}

const MARKDOWN_COMPONENTS = {
  code: CodeBlock,
  table: (props) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  )
};

function MessageBubble({ message, onCopy, isCopied, isStreaming, onRegenerate, onEditUser }) {
  const isUser = message.role === 'user';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  if (isUser && editing) {
    const submit = () => {
      const v = draft.trim();
      if (v && v !== message.content) onEditUser?.(v);
      setEditing(false);
    };
    return (
      <div className="user-edit">
        <textarea
          className="user-edit__textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(8, draft.split('\n').length + 1)}
          autoFocus
        />
        <div className="user-edit__actions">
          <button type="button" className="message-action-btn" onClick={() => { setDraft(message.content); setEditing(false); }}>Batal</button>
          <button type="button" className="message-action-btn" onClick={submit}>Kirim ulang</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`message-bubble ${isUser ? 'user' : 'assistant'} ${!isUser && isStreaming ? 'assistant--streaming' : ''}`}
      aria-live={!isUser && isStreaming ? 'polite' : 'off'}
    >
      {isUser ? (
        <>
          <p>{message.content}</p>
          {onEditUser && (
            <div className="message-actions">
              <button
                type="button"
                className="message-action-btn"
                onClick={() => { setDraft(message.content); setEditing(true); }}
                aria-label="Edit pesan"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                Edit
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {message.content && (
            <button
              className="copy-btn"
              onClick={() => onCopy(message.content)}
              aria-label="Salin pesan"
            >
              {isCopied ? 'Disalin' : 'Salin'}
            </button>
          )}
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={MARKDOWN_COMPONENTS}
          >
            {message.content || '...'}
          </ReactMarkdown>
          <SourcesFooter content={message.content} />
          {onRegenerate && !isStreaming && message.content && (
            <div className="message-actions">
              <button
                type="button"
                className="message-action-btn"
                onClick={onRegenerate}
                aria-label="Regenerate"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                Regenerate
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MessageBubble;
