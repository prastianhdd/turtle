import { useState, useRef, useEffect } from 'react';
import SpikeMark from './SpikeMark';

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onLogin(password);
    } catch (err) {
      setError(err.message || 'Gagal masuk.');
      setPassword('');
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <SpikeMark className="login-glyph" size={32} />
        <h1 className="login-title">Turtle</h1>
        <p className="login-subtitle">Akses Claude Opus 4.7 tanpa batas. Privat, tanpa rate limit Web UI.</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-input-wrap">
            <input
              ref={inputRef}
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
              placeholder="Password"
              autoComplete="current-password"
              disabled={submitting}
              aria-label="Password"
              aria-invalid={Boolean(error)}
              className="login-input"
            />
            <button
              type="button"
              className="login-toggle"
              onClick={() => setShow(s => !s)}
              tabIndex={-1}
              aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
            >
              {show ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}

          <button
            type="submit"
            className="login-submit"
            disabled={submitting || !password}
          >
            {submitting ? 'Memeriksa…' : 'Akses'}
          </button>
        </form>

        <p className="login-footer">
          Sesi aktif 7 hari. Tutup browser tidak meng-logout.
        </p>
      </div>
    </div>
  );
}

export default Login;
