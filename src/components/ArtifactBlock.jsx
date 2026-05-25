// Artifact preview — render HTML/SVG dalam iframe sandbox.
// Dipanggil dari MessageBubble saat lihat ```html``` atau ```svg``` fence.

import { useState, useMemo } from 'react';

function buildHtmlDoc(rawHtml) {
  // Inject base styles minimal supaya artifact tampil rapi tanpa boilerplate user
  const looksLikeFullDoc = /<!doctype/i.test(rawHtml) || /<html[\s>]/i.test(rawHtml);
  if (looksLikeFullDoc) return rawHtml;
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 16px; line-height: 1.5; color: #141413; background: #faf9f5; }
  pre, code { font-family: ui-monospace, "Cascadia Code", Menlo, monospace; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e6dfd8; padding: 6px 10px; text-align: left; }
</style>
</head>
<body>
${rawHtml}
</body>
</html>`;
}

function buildSvgDoc(svg) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#faf9f5}svg{max-width:100%;height:auto}</style></head><body>${svg}</body></html>`;
}

export default function ArtifactBlock({ kind, source }) {
  const [view, setView] = useState('preview'); // preview | code
  const [copied, setCopied] = useState(false);

  const srcDoc = useMemo(() => {
    if (kind === 'svg') return buildSvgDoc(source);
    return buildHtmlDoc(source);
  }, [kind, source]);

  const handleCopy = () => {
    navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="artifact-block">
      <div className="artifact-block__header">
        <div className="artifact-block__tabs">
          <button
            type="button"
            className={`artifact-tab ${view === 'preview' ? 'artifact-tab--active' : ''}`}
            onClick={() => setView('preview')}
          >Preview</button>
          <button
            type="button"
            className={`artifact-tab ${view === 'code' ? 'artifact-tab--active' : ''}`}
            onClick={() => setView('code')}
          >Code</button>
        </div>
        <div className="artifact-block__actions">
          <span className="artifact-block__lang">{kind.toUpperCase()}</span>
          <button type="button" className="artifact-block__copy" onClick={handleCopy}>
            {copied ? 'Disalin' : 'Salin'}
          </button>
        </div>
      </div>

      {view === 'preview' ? (
        <iframe
          className="artifact-block__frame"
          title="artifact"
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      ) : (
        <pre className="artifact-block__source"><code>{source}</code></pre>
      )}
    </div>
  );
}
