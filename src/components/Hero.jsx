import { useEffect, useRef, useState } from 'react';
import HeroMockup from './HeroMockup';

const ROTATING_WORDS = ['tiap hari.', 'tanpa batas.', 'serius.', 'profesional.'];

export default function Hero({ onLogin, error }) {
  const artRef = useRef(null);
  const [wordIdx, setWordIdx] = useState(0);

  // Rotating word — ganti tiap 2.6s
  useEffect(() => {
    const id = setInterval(() => {
      setWordIdx(i => (i + 1) % ROTATING_WORDS.length);
    }, 2600);
    return () => clearInterval(id);
  }, []);

  // Parallax mouse — gerakan halus mockup mengikuti kursor (max ±8px)
  useEffect(() => {
    const el = artRef.current;
    if (!el) return;

    let raf = 0;
    let targetX = 0, targetY = 0;
    let curX = 0, curY = 0;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    function onMove(e) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const nx = (e.clientX / w - 0.5) * 2;  // -1..1
      const ny = (e.clientY / h - 0.5) * 2;
      targetX = nx * 8;
      targetY = ny * 8;
      if (!raf) loop();
    }

    function loop() {
      raf = requestAnimationFrame(loop);
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      el.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;
      if (Math.abs(targetX - curX) < 0.05 && Math.abs(targetY - curY) < 0.05) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="hero" data-theme-lock="light">
      <div className="hero__inner">
        <div className="hero__copy">
          <span className="hero__eyebrow">
            <span className="hero__eyebrow-dot" />
            Powered by Claude Opus 4.7
          </span>

          <h1 className="hero__title">
            Claude Opus 4.7<br />
            yang Anda pakai{' '}
            <span className="hero__rotating" aria-live="polite">
              <span key={wordIdx} className="hero__rotating-word">
                {ROTATING_WORDS[wordIdx]}
              </span>
            </span>
          </h1>

          <p className="hero__sub">
            Lebih kuat dari Sonnet 4.6 di Web UI. Multi-tool agent, RAG dokumen,
            vision, memory lintas-sesi &mdash; semua dalam satu chat tanpa batas.
          </p>

          <div className="hero__cta">
            <button type="button" className="hero__cta-primary" onClick={onLogin} autoFocus>
              <GoogleIcon size={18} />
              <span>Masuk dengan Google</span>
              <span className="hero__cta-arrow" aria-hidden="true">→</span>
            </button>
            <a className="hero__cta-secondary" href="#mode">
              Lihat cara kerja
              <span aria-hidden="true">↓</span>
            </a>
          </div>

          {error && (
            <p className="hero__error" role="alert">
              Login gagal: {error}. Coba lagi.
            </p>
          )}

          <div className="hero__trust">
            <TrustItem icon="check">Tanpa kartu kredit</TrustItem>
            <TrustItem icon="lock">Sesi 30 hari aman</TrustItem>
            <TrustItem icon="shield">Data tetap milik Anda</TrustItem>
          </div>
        </div>

        <div className="hero__art" ref={artRef} aria-hidden="true">
          <div className="hero__art-glow" />
          <HeroMockup />
        </div>
      </div>

      <ScrollHint />
    </section>
  );
}

function ScrollHint() {
  return (
    <div className="hero__scroll-hint" aria-hidden="true">
      <span className="hero__scroll-line" />
      <span className="hero__scroll-text">Scroll</span>
    </div>
  );
}

function TrustItem({ icon, children }) {
  return (
    <span className="hero__trust-item">
      <TrustIcon kind={icon} />
      <span>{children}</span>
    </span>
  );
}

function TrustIcon({ kind }) {
  const props = {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
  };
  if (kind === 'lock') {
    return (
      <svg {...props}>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  }
  if (kind === 'shield') {
    return (
      <svg {...props}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
