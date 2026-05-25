// Bearer token auth via localStorage. Token disisipkan ke Authorization header.

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

export function useAuth() {
  const [status, setStatus] = useState({ loading: true, authenticated: false, required: true });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setStatus({
          loading: false,
          authenticated: Boolean(data.authenticated),
          required: Boolean(data.required)
        });
      } else {
        setStatus({ loading: false, authenticated: false, required: true });
      }
    } catch {
      setStatus({ loading: false, authenticated: false, required: true });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Login gagal (${res.status})`);
    if (!data.token) throw new Error('Token tidak ada di response');
    setStored(data.token, data.expiresAt);
    setStatus({ loading: false, authenticated: true, required: true });
    return data;
  }, []);

  const logout = useCallback(async () => {
    setStored(null);
    setStatus({ loading: false, authenticated: false, required: true });
    // Optional notify server (stateless, tidak benar2 perlu)
    fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(() => {});
  }, []);

  return { ...status, login, logout, refresh };
}
