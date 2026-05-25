import { useState, useEffect, useCallback } from 'react';

export function useAuth() {
  const [status, setStatus] = useState({ loading: true, authenticated: false, required: true });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStatus({ loading: false, authenticated: Boolean(data.authenticated), required: Boolean(data.required) });
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
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Login gagal (${res.status})`);
    setStatus({ loading: false, authenticated: true, required: true });
    return data;
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setStatus({ loading: false, authenticated: false, required: true });
  }, []);

  return { ...status, login, logout, refresh };
}
