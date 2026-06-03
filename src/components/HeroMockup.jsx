import { useEffect, useState } from 'react';

// State-driven typewriter loop. No external library. Lightweight (~3KB).
// Loop: idle → typing-user → tool running → tool done → typing-asst → table reveal → citation reveal → pause → reset.

const USER_PROMPT = 'Buatkan diagram alur metodologi riset.';
const ASSISTANT_INTRO = 'Tentu. Saya susun flowchart dengan Mermaid.';

// Frame steps in ms. Sequential.
const FRAMES = [
  { phase: 'user-typing',   duration: 1400 },
  { phase: 'tool-running',  duration: 1500 },
  { phase: 'tool-done',     duration: 700 },
  { phase: 'asst-typing',   duration: 1500 },
  { phase: 'render-diagram',duration: 800 },
  { phase: 'show-sources',  duration: 1000 },
  { phase: 'pause',         duration: 2400 }
];

function useTypewriter(text, active, speed = 22) {
  const [out, setOut] = useState('');
  useEffect(() => {
    if (!active) { setOut(''); return; }
    let i = 0;
    setOut('');
    const id = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);
  return out;
}

export default function HeroMockup() {
  const [frameIdx, setFrameIdx] = useState(0);
  const [tick, setTick] = useState(0); // force re-trigger typewriter on loop reset

  useEffect(() => {
    const t = setTimeout(() => {
      setFrameIdx(prev => {
        if (prev + 1 >= FRAMES.length) {
          setTick(x => x + 1); // reset typewriter pada loop
          return 0;
        }
        return prev + 1;
      });
    }, FRAMES[frameIdx].duration);
    return () => clearTimeout(t);
  }, [frameIdx]);

  const phase = FRAMES[frameIdx].phase;
  // visibility flags — "show after this phase reached"
  const showUser     = ['user-typing','tool-running','tool-done','asst-typing','render-diagram','show-sources','pause'].includes(phase);
  const showTool     = ['tool-running','tool-done','asst-typing','render-diagram','show-sources','pause'].includes(phase);
  const toolDone     = ['tool-done','asst-typing','render-diagram','show-sources','pause'].includes(phase);
  const showAsst     = ['asst-typing','render-diagram','show-sources','pause'].includes(phase);
  const showDiagram  = ['render-diagram','show-sources','pause'].includes(phase);
  const showSources  = ['show-sources','pause'].includes(phase);

  const userText = useTypewriter(USER_PROMPT, phase === 'user-typing', 28);
  const asstText = useTypewriter(ASSISTANT_INTRO, phase === 'asst-typing', 22);

  return (
    <div className="hero-mockup" key={tick}>
      <div className="hero-mockup__bar">
        <span className="hero-mockup__dot hero-mockup__dot--r" />
        <span className="hero-mockup__dot hero-mockup__dot--y" />
        <span className="hero-mockup__dot hero-mockup__dot--g" />
        <span className="hero-mockup__title">claudepro.web.id</span>
      </div>
      <div className="hero-mockup__body">
        {/* User msg */}
        {showUser && (
          <div className="hero-msg hero-msg--user">
            {phase === 'user-typing' ? (
              <>{userText}<span className="hero-caret" /></>
            ) : USER_PROMPT}
          </div>
        )}

        {/* Tool chip */}
        {showTool && (
          <div className={`hero-tool-chip ${toolDone ? 'hero-tool-chip--done' : ''}`}>
            {toolDone ? (
              <>
                <span className="hero-tool-chip__check">✓</span>
                <span>arXiv · 5 referensi metodologi</span>
              </>
            ) : (
              <>
                <span className="hero-tool-chip__dot" />
                <span>Mencari di arXiv…</span>
              </>
            )}
          </div>
        )}

        {/* Assistant intro */}
        {showAsst && (
          <div className="hero-msg hero-msg--asst">
            <p>
              {phase === 'asst-typing' ? (
                <>{asstText}<span className="hero-caret" /></>
              ) : ASSISTANT_INTRO}
            </p>

            {/* Diagram */}
            {showDiagram && (
              <div className="hero-diagram" aria-hidden="true">
                <svg viewBox="0 0 320 180" width="100%" height="auto">
                  <defs>
                    <marker id="hero-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                      <path d="M0,0 L10,5 L0,10 z" fill="var(--body)" />
                    </marker>
                  </defs>
                  <NodeBox x="20"  y="20"  w="80" h="36" label="Masalah" />
                  <NodeBox x="120" y="20"  w="80" h="36" label="Studi pustaka" />
                  <NodeBox x="220" y="20"  w="80" h="36" label="Hipotesis" />
                  <NodeBox x="20"  y="80"  w="80" h="36" label="Data" />
                  <NodeBox x="120" y="80"  w="80" h="36" label="Analisis" coral />
                  <NodeBox x="220" y="80"  w="80" h="36" label="Hasil" />
                  <NodeBox x="120" y="140" w="80" h="36" label="Kesimpulan" />
                  {/* arrows */}
                  <line x1="100" y1="38"  x2="120" y2="38"  stroke="var(--body)" strokeWidth="1.4" markerEnd="url(#hero-arrow)" />
                  <line x1="200" y1="38"  x2="220" y2="38"  stroke="var(--body)" strokeWidth="1.4" markerEnd="url(#hero-arrow)" />
                  <line x1="260" y1="56"  x2="260" y2="80"  stroke="var(--body)" strokeWidth="1.4" markerEnd="url(#hero-arrow)" />
                  <line x1="220" y1="98"  x2="200" y2="98"  stroke="var(--body)" strokeWidth="1.4" markerEnd="url(#hero-arrow)" />
                  <line x1="120" y1="98"  x2="100" y2="98"  stroke="var(--body)" strokeWidth="1.4" markerEnd="url(#hero-arrow)" />
                  <line x1="160" y1="116" x2="160" y2="140" stroke="var(--body)" strokeWidth="1.4" markerEnd="url(#hero-arrow)" />
                </svg>
              </div>
            )}

            {/* Source cards */}
            {showSources && (
                <div className="hero-sources">
                  <div className="hero-source">
                    <span className="hero-source__fav" style={{ background: '#b31b1b' }}>a</span>
                    <span className="hero-source__name">arxiv.org</span>
                  </div>
                  <div className="hero-source">
                    <span className="hero-source__fav" style={{ background: '#1a73e8' }}>n</span>
                    <span className="hero-source__name">nature.com</span>
                  </div>
                  <div className="hero-source">
                    <span className="hero-source__fav" style={{ background: '#5d4037' }}>s</span>
                    <span className="hero-source__name">sciencedirect.com</span>
                  </div>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NodeBox({ x, y, w, h, label, coral }) {
  const fill = coral ? 'rgba(204,120,92,0.12)' : 'var(--canvas)';
  const stroke = coral ? 'var(--primary)' : 'var(--hairline)';
  const textColor = coral ? 'var(--primary)' : 'var(--body)';
  return (
    <g>
      <rect
        x={x} y={y} width={w} height={h} rx="6"
        fill={fill} stroke={stroke} strokeWidth="1.2"
      />
      <text
        x={Number(x) + Number(w) / 2}
        y={Number(y) + Number(h) / 2 + 4}
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontSize="11"
        fontWeight="500"
        fill={textColor}
      >
        {label}
      </text>
    </g>
  );
}
