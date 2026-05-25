import SpikeMark from './SpikeMark';

const ERROR_MESSAGES = {
  no_code: 'Login dibatalkan.',
  state_mismatch: 'Sesi login kedaluwarsa, coba lagi.',
  token_exchange_failed: 'Gagal verifikasi Google. Coba lagi.',
  userinfo_failed: 'Gagal mengambil profil dari Google.',
  no_email: 'Akun Google Anda tidak punya email publik.',
  internal_error: 'Terjadi kesalahan server. Coba lagi.',
  access_denied: 'Akses ditolak.'
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.35 11.1H12.18v3.36h5.27c-.23 1.42-1.66 4.16-5.27 4.16-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.81 0 3.02.77 3.71 1.43l2.53-2.43C16.6 4.5 14.6 3.5 12.18 3.5 6.92 3.5 2.62 7.8 2.62 13.06s4.3 9.56 9.56 9.56c5.52 0 9.18-3.88 9.18-9.34 0-.62-.07-1.1-.16-1.58z"/>
      <path fill="#34A853" d="M12.18 22.62c2.59 0 4.77-.86 6.36-2.34l-3.04-2.36c-.84.58-1.95.99-3.32.99-2.55 0-4.71-1.72-5.48-4.04H3.55v2.53c1.58 3.13 4.83 5.22 8.63 5.22z"/>
      <path fill="#FBBC05" d="M6.7 14.87c-.2-.58-.31-1.2-.31-1.81 0-.62.11-1.23.3-1.81V8.71H3.55c-.65 1.27-1.02 2.71-1.02 4.35s.37 3.08 1.02 4.35l3.15-2.54z"/>
      <path fill="#EA4335" d="M12.18 6.86c1.41 0 2.36.6 2.91 1.11l2.13-2.07c-1.3-1.21-2.99-1.96-5.04-1.96-3.8 0-7.05 2.09-8.63 5.22l3.15 2.54c.77-2.32 2.93-4.04 5.48-4.04z"/>
    </svg>
  );
}

function Login({ onLogin, error }) {
  const errMsg = error ? (ERROR_MESSAGES[error] || `Error: ${error}`) : null;

  return (
    <div className="login-screen">
      <div className="login-card">
        <SpikeMark className="login-glyph" size={32} />
        <h1 className="login-title">Turtle</h1>
        <p className="login-subtitle">Akses Claude Opus 4.7 tanpa batas. Masuk dengan akun Google Anda.</p>

        {errMsg && <div className="login-error" role="alert">{errMsg}</div>}

        <button
          type="button"
          className="login-google"
          onClick={onLogin}
        >
          <GoogleIcon />
          <span>Masuk dengan Google</span>
        </button>

        <p className="login-footer">
          Sesi aktif 30 hari. Tutup browser tidak meng-logout.
        </p>
      </div>
    </div>
  );
}

export default Login;
