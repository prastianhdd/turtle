// Cookie-based auth: HMAC-signed token. Stateless (no DB). 7 day expiry.
//
// Env vars:
//   ACCESS_PASSWORD  — password yang user input di halaman login
//   AUTH_SECRET      — secret untuk HMAC-sign cookie. WAJIB di prod.
//                      Kalau kosong, fallback ke ACCESS_PASSWORD (kurang aman).

import crypto from 'crypto';

const COOKIE_NAME = 'turtle_auth';
const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

function getPassword() {
  return process.env.ACCESS_PASSWORD || '';
}

function getSecret() {
  return process.env.AUTH_SECRET || process.env.ACCESS_PASSWORD || 'dev-only-fallback-secret';
}

function sign(payload) {
  const secret = getSecret();
  const data = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const secret = getSecret();
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  // timing-safe compare
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function setAuthCookie(res, payload) {
  const token = sign(JSON.stringify(payload));
  const isHttps = (process.env.SITE_URL || '').startsWith('https');
  const opts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    `Path=/`,
    `Max-Age=${TTL_MS / 1000}`
  ];
  if (isHttps) opts.push('Secure');
  res.setHeader('Set-Cookie', opts.join('; '));
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// === Routes ===

export function handleLogin(req, res) {
  const password = getPassword();
  if (!password) {
    return res.status(503).json({
      ok: false,
      error: 'Server belum di-set ACCESS_PASSWORD. Hubungi admin.'
    });
  }
  const input = req.body?.password;
  if (typeof input !== 'string' || input.length === 0) {
    return res.status(400).json({ ok: false, error: 'Password kosong.' });
  }
  // timing-safe password compare
  const a = Buffer.from(input);
  const b = Buffer.from(password);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    // delay kecil supaya brute force lebih lambat
    return setTimeout(
      () => res.status(401).json({ ok: false, error: 'Password salah.' }),
      400
    );
  }
  setAuthCookie(res, { iat: Date.now(), exp: Date.now() + TTL_MS });
  return res.json({ ok: true });
}

export function handleLogout(_req, res) {
  clearAuthCookie(res);
  return res.json({ ok: true });
}

export function handleAuthStatus(req, res) {
  const password = getPassword();
  // Kalau server tidak set password sama sekali → tidak butuh auth.
  if (!password) {
    return res.json({ authenticated: true, required: false });
  }
  const token = req.cookies?.[COOKIE_NAME];
  const payload = verify(token);
  return res.json({ authenticated: Boolean(payload), required: true });
}

// Middleware: protect /api/* routes. Public: /api/auth/*, /api/health
export function requireAuth(req, res, next) {
  const password = getPassword();
  if (!password) return next(); // auth disabled

  const path = req.path || '';
  if (
    path.startsWith('/api/auth/') ||
    path === '/api/auth' ||
    path === '/api/health'
  ) {
    return next();
  }

  const token = req.cookies?.[COOKIE_NAME];
  const payload = verify(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}