import SpikeMark from './SpikeMark';
import Hero from './Hero';
import ModeShowcase from './ModeShowcase';
import LandingBackdrop from './LandingBackdrop';

function GoogleIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

const COMPARE_ROWS = [
  { feature: 'Model akses',          web: 'Sonnet 4.6 (default)', turtle: 'Opus 4.7 / Sonnet 4.6 / pilih sendiri' },
  { feature: 'Rate limit',           web: 'Ya, ketat (5h reset)',  turtle: 'Tidak ada batas keras', highlight: true },
  { feature: 'Tool use',             web: 'Beberapa fitur premium', turtle: 'Web search, arXiv, kalkulator, RAG' },
  { feature: 'Upload PDF + RAG',     web: 'Hanya plan tertentu',    turtle: 'Otomatis di chunk + cari semantik' },
  { feature: 'Vision (image)',       web: 'Ya',                     turtle: 'Ya' },
  { feature: 'Memory lintas-sesi',   web: 'Terbatas',               turtle: 'Asisten simpan + recall sendiri' },
  { feature: 'Diagram + artifact',   web: 'Artifact terbatas',      turtle: 'Mermaid + HTML/SVG live preview' },
  { feature: 'Langganan',            web: 'Pro / Max berbayar',     turtle: 'Akses ke akun terbatas (gratis)', highlight: true },
];

function LandingPage({ onLogin, error }) {
  return (
    <div className="landing landing--light">
      <LandingBackdrop />
      <header className="landing-nav">
        <div className="landing-nav__inner">
          <div className="landing-brand">
            <SpikeMark className="landing-brand__glyph" size={20} />
            <span className="landing-brand__name">Turtle</span>
          </div>
          <nav className="landing-nav__links" aria-label="Navigasi">
            <a href="#mode">Mode</a>
            <a href="#perbandingan">vs Web UI</a>
          </nav>
          <button type="button" className="landing-nav__cta" onClick={onLogin}>
            Masuk
          </button>
        </div>
      </header>

      <main>
        <Hero onLogin={onLogin} error={error} />

        <ModeShowcase />

        <section id="perbandingan" className="landing-compare">
          <div className="landing-compare__inner">
            <h2 className="landing-section-title">vs Web UI Claude.</h2>
            <p className="landing-compare__lede">
              Web UI Claude bagus untuk casual. Tapi rate limit membatasi.
              Turtle dirancang untuk yang pakai Claude tiap hari.
            </p>

            <div className="compare-table-wrap" role="region" aria-label="Perbandingan fitur">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th scope="col">Fitur</th>
                    <th scope="col">Web UI Claude</th>
                    <th scope="col" className="compare-table__hl">Turtle</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row) => (
                    <tr key={row.feature} className={row.highlight ? 'compare-row--hl' : ''}>
                      <th scope="row">{row.feature}</th>
                      <td>
                        <span className="compare-cell compare-cell--neutral">
                          <CrossIcon /> {row.web}
                        </span>
                      </td>
                      <td>
                        <span className="compare-cell compare-cell--good">
                          <CheckIcon /> {row.turtle}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="landing-compare__cta">
              <button type="button" className="landing-cta" onClick={onLogin}>
                <GoogleIcon size={20} />
                <span>Mulai sekarang dengan Google</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__brand">
            <SpikeMark className="landing-brand__glyph" size={16} />
            <span>Turtle</span>
          </div>
          <p className="landing-footer__note">
            Bukan produk resmi Anthropic. Personal/educational use.
          </p>
          <p className="landing-footer__credit">
            Dibuat oleh{' '}
            <a href="https://github.com/prastianhdd" target="_blank" rel="noopener noreferrer">
              PrastianHD
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
