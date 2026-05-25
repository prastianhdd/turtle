import { useEffect, useRef, useState, useId } from 'react';
import mermaid from 'mermaid';

let initialized = false;
function ensureInit() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    fontFamily: 'inherit'
  });
  initialized = true;
}

export default function MermaidBlock({ chart }) {
  const ref = useRef(null);
  const reactId = useId();
  const id = 'mermaid-' + reactId.replace(/:/g, '');
  const [error, setError] = useState(null);

  useEffect(() => {
    ensureInit();
    let cancelled = false;
    const trimmed = (chart || '').trim();
    if (!trimmed) return;

    (async () => {
      try {
        const { svg } = await mermaid.render(id, trimmed);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Mermaid render error');
      }
    })();

    return () => { cancelled = true; };
  }, [chart, id]);

  if (error) {
    return (
      <div className="mermaid-error">
        <strong>Mermaid render error:</strong> {error}
        <pre>{chart}</pre>
      </div>
    );
  }
  return <div className="mermaid-block" ref={ref} aria-label="diagram" />;
}
