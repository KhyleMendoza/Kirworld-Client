const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_WS_URL || 'http://localhost:3001';

export async function signUp({ username, email, password }) {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function login({ email, password }) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

const SESSION_KEY = 'kirworld_session';

export function getSession() {
  try {
    const s = localStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export async function validateSession() {
  const session = getSession();
  if (!session?.token) return null;
  const res = await fetch(`${API_URL}/auth/session?token=${encodeURIComponent(session.token)}`);
  if (!res.ok) return null;
  const user = await res.json();
  return user;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
