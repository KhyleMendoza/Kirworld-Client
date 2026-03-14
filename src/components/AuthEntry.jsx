import { useState } from 'react';
import { signUp, login, setSession, clearSession } from '../lib/authApi';
import '../styles/AuthEntry.css';

export default function AuthEntry({ onSuccess, disconnectMessage, onDismissDisconnectMessage }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  function handleGuest() {
    setError('');
    setGuestLoading(true);
    try {
      clearSession();
      onSuccess?.({ username: 'Guest' });
    } finally {
      setGuestLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const trimmedName = username.trim().slice(0, 20);
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setError('Username is required');
      setLoading(false);
      return;
    }
    if (!/^[A-Za-z0-9_]+$/.test(trimmedName)) {
      setError('Username can only use letters, numbers, and underscores (no spaces or symbols)');
      setLoading(false);
      return;
    }
    if (!trimmedEmail || !password) {
      setError('Email and password are required');
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }
    try {
      const user = await signUp({ username: trimmedName, email: trimmedEmail, password });
      setSession({ ...user, token: user.token });
      onSuccess({ username: user.username });
    } catch (e) {
      setError(e?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Email and password are required');
      setLoading(false);
      return;
    }
    try {
      const user = await login({ email: trimmedEmail, password });
      setSession({ ...user, token: user.token });
      onSuccess({ username: user.username });
    } catch (e) {
      setError(e?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <h1>KIRWORLD</h1>
          <p>{mode === 'login' ? 'Welcome back' : 'Create your account'}</p>
        </div>
        {disconnectMessage && (
          <div className="auth-disconnect" role="alert">
            <span>{disconnectMessage}</span>
            {onDismissDisconnectMessage && (
              <button type="button" className="auth-disconnect-dismiss" onClick={onDismissDisconnectMessage} aria-label="Dismiss">×</button>
            )}
          </div>
        )}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'auth-tab--active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'auth-tab--active' : ''}`}
            onClick={() => { setMode('register'); setError(''); setConfirmPassword(''); }}
          >
            Sign up
          </button>
        </div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {mode === 'register' ? (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="auth-field">
              <label htmlFor="reg-username">Username</label>
              <input
                id="reg-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a display name"
                maxLength={20}
                autoComplete="username"
              />
            </div>
            <div className="auth-field">
              <label htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="reg-password">Password</label>
              <div className="auth-password-wrap">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M3 3l18 18M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.4 18.4 0 0 1 4.52-5.42M9.88 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.44 3.6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="3.2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="auth-field">
              <label htmlFor="reg-confirm">Confirm password</label>
              <div className="auth-password-wrap">
                <input
                  id="reg-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M3 3l18 18M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.4 18.4 0 0 1 4.52-5.42M9.88 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.44 3.6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="3.2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="auth-field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="login-password">Password</label>
              <div className="auth-password-wrap">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M3 3l18 18M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.4 18.4 0 0 1 4.52-5.42M9.88 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.44 3.6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="3.2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
        <button
          type="button"
          className="auth-guest"
          onClick={handleGuest}
          disabled={loading || guestLoading}
        >
          {guestLoading ? 'Entering as guest…' : 'Continue as guest'}
        </button>
      </div>
    </div>
  );
}
