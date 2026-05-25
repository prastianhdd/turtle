// Auth: Google OAuth 2.0 (authorization code flow) + JWT issuance.
// Multi-user. Token disisipkan ke Authorization: Bearer header oleh frontend.
//
// Env:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI       # https://claudepro.web.id/api/auth/google/callback
//   AUTH_SECRET                # untuk HMAC sign JWT
//   FRONTEND_REDIRECT_URI      # opsional, default `${SITE_URL}/auth/callback`
//   AUTH_DISABLED              # opsional, set "true" untuk dev tanpa Google
//
// Flow:
//   1. Frontend redirect ke /api/auth/google
//   2. Backend redirect ke accounts.google.com dengan client_id + scope
//   3. User consent → Google redirect ke /api/auth/google/callback?code=xxx
//   4. Backend exchange code → access_token → fetch userinfo
//   5. Upsert user di DB → issue JWT
//   6. Backend redirect ke frontend dengan ?token=... di hash

import crypto from 'crypto';
import { upsertUserByGoogle, getUserById } from './db.js';

const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

function getEnv() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    secret: process.env.AUTH_SECRET || 'dev-only-fallback-secret-please-change',
    siteUrl: process.env.SITE_URL || 'http://localhost:5173',
    authDisabled: process.env.AUTH_DISABLED === 'true'
  };
}

// === JWT helpers (HMAC-SHA256) ===
function signToken(payload) {
  const { secret } = getEnv();
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const { secret } = getEnv();
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
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

function extractToken(req) {
  const h = req.headers?.authorization;
  if (!h || typeof h !== 'string') return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// === Routes ===

// GET /api/auth/google → redirect ke Google consent
export function handleGoogleStart(req, res) {
  const { clientId, redirectUri } = getEnv();
  if (!clientId || !redirectUri) {
    return res.status(503).json({ error: 'Google OAuth belum di-konfigurasi server.' });
  }

  // CSRF state — simpan di httpOnly cookie kecil sementara (single-use)
  const state = crypto.randomBytes(16).toString('base64url');
  res.setHeader('Set-Cookie',
    `oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=600${redirectUri.startsWith('https') ? '; Secure' : ''}`
  );

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', state);

  res.redirect(url.toString());
}

// GET /api/auth/google/callback?code=...&state=...
export async function handleGoogleCallback(req, res) {
  const { clientId, clientSecret, redirectUri, siteUrl } = getEnv();
  const { code, state, error: googleError } = req.query || {};

  if (googleError) {
    return redirectWithError(res, siteUrl, googleError);
  }
  if (!code) {
    return redirectWithError(res, siteUrl, 'no_code');
  }

  // CSRF check via cookie
  const cookieHeader = req.headers?.cookie || '';
  const stateCookie = cookieHeader.split(/;\s*/).find(c => c.startsWith('oauth_state='))?.split('=')[1];
  if (!stateCookie || stateCookie !== state) {
    return redirectWithError(res, siteUrl, 'state_mismatch');
  }
  res.setHeader('Set-Cookie', `oauth_state=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0`);

  try {
    // 1. Exchange code → tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    if (!tokenRes.ok) {
      const txt = await tokenRes.text().catch(() => '');
      console.error('[oauth] token exchange failed:', tokenRes.status, txt.slice(0, 300));
      return redirectWithError(res, siteUrl, 'token_exchange_failed');
    }
    const tokens = await tokenRes.json();

    // 2. Fetch userinfo
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!userInfoRes.ok) {
      return redirectWithError(res, siteUrl, 'userinfo_failed');
    }
    const profile = await userInfoRes.json();
    if (!profile.email) {
      return redirectWithError(res, siteUrl, 'no_email');
    }

    // 3. Upsert user
    const user = await upsertUserByGoogle({
      googleSub: profile.id,
      email: profile.email,
      name: profile.name || null,
      picture: profile.picture || null
    });

    // 4. Issue JWT
    const token = signToken({
      sub: user.id,
      email: user.email,
      iat: Date.now(),
      exp: Date.now() + TTL_MS
    });

    // 5. Redirect ke frontend dengan token di hash (bukan query, agar tidak di-log proxy)
    const target = new URL(siteUrl);
    target.hash = `token=${token}&expires=${Date.now() + TTL_MS}`;
    return res.redirect(target.toString());
  } catch (err) {
    console.error('[oauth] callback error:', err.message);
    return redirectWithError(res, siteUrl, 'internal_error');
  }
}

function redirectWithError(res, siteUrl, code) {
  const target = new URL(siteUrl);
  target.hash = `auth_error=${encodeURIComponent(code)}`;
  return res.redirect(target.toString());
}

// GET /api/auth/me — return current user kalau token valid
export async function handleMe(req, res) {
  const token = extractToken(req);
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ authenticated: false });
  const user = await getUserById(payload.sub);
  if (!user) return res.status(401).json({ authenticated: false });
  res.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture
    }
  });
}

export function handleAuthStatus(req, res) {
  const { authDisabled, clientId } = getEnv();
  if (authDisabled || !clientId) {
    return res.json({ authenticated: true, required: false });
  }
  const token = extractToken(req);
  const payload = verifyToken(token);
  return res.json({ authenticated: Boolean(payload), required: true });
}

export function handleLogout(_req, res) {
  // Stateless — frontend hapus localStorage
  return res.json({ ok: true });
}

// Middleware: protect /api/* routes selain /api/auth/* dan /api/health.
// Inject req.userId untuk handler downstream.
export function requireAuth(req, res, next) {
  const { authDisabled, clientId } = getEnv();
  // Auth disabled (dev mode atau Google OAuth belum di-set)
  if (authDisabled || !clientId) {
    req.userId = null;
    return next();
  }

  const path = req.path || '';

  // Skip non-API path — biarkan static SPA serve.
  if (!path.startsWith('/api/')) return next();

  // Whitelist public API endpoints
  if (
    path.startsWith('/api/auth/') ||
    path === '/api/auth' ||
    path === '/api/health'
  ) {
    return next();
  }

  const token = extractToken(req);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.userId = payload.sub;
  next();
}