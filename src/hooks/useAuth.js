// Bearer token auth via localStorage. Token disisipkan ke Authorization header.
// Multi-user via Google OAuth — token issued by /api/auth/google/callback.

import { useState, useEffect, useCallback } from 'react';

const TOKEN_KEY = 'turtle_token';
const EXP_KEY = 'turtle_token_exp';

export function getToken() {
  const exp = Number(localStorage.getItem(EXP_KEY) || 0);
  if (exp && Date.now() > exp) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXP_KEY);
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function setStored(token, expiresAt) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    if (expiresAt) localStorage.setItem(EXP_KEY, String(expiresAt));
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXP_KEY);
  }
}

// Parse hash setelah redirect dari /api/auth/google/callback
// Format: #token=xxx&expires=123  atau  #auth_error=xxx
function consumeAuthHashFromUrl() {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get('token');
  const expires = params.get('expires');
  const error = params.get('auth_error');

  if (token) {
    setStored(token, expires ? Number(expires) : null);
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return { token };
  }
  if (error) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return { error };
  }
  return null;
}

export function useAuth() {
  const [status, setStatus] = useState({
    loading: true,
    authenticated: false,
    required: true,
    user: null,
    error: null
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', { headers: authHeaders() });
      const data = res.ok ? await res.json() : { authenticated: false, required: true };

      if (data.authenticated && data.required) {
        // Fetch user profile
        try {
          const meRes = await fetch('/api/auth/me', { headers: authHeaders() });
          const me = await meRes.json().catch(() => ({}));
          setStatus({
            loading: false,
            authenticated: true,
            required: true,
            user: me.user || null,
            error: null
          });
          return;
        } catch {
          // Continue without profile
        }
      }
      setStatus({
        loading: false,
        authenticated: Boolean(data.authenticated),
        required: Boolean(data.required),
        user: null,
        error: null
      });
    } catch {
      setStatus({ loading: false, authenticated: false, required: true, user: null, error: null });
    }
  }, []);

  useEffect(() => {
    const consumed = consumeAuthHashFromUrl();
    if (consumed?.error) {
      setStatus(s => ({ ...s, error: consumed.error }));
    }
    refresh();
  }, [refresh]);

  const loginWithGoogle = useCallback(() => {
    window.location.href = '/api/auth/google';
  }, []);

  const logout = useCallback(async () => {
    setStored(null);
    setStatus({ loading: false, authenticated: false, required: true, user: null, error: null });
    fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(() => {});
  }, []);

  return { ...status, loginWithGoogle, logout, refresh };
}
