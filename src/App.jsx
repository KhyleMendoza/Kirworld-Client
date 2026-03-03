import { useState, useEffect } from 'react';
import { getSession, clearSession, validateSession } from './lib/authApi';
import AuthEntry from './components/AuthEntry';
import GameArea from './components/GameArea';
import './styles/AuthEntry.css';

export default function App() {
  const [playerName, setPlayerName] = useState(null);
  const [checking, setChecking] = useState(true);
  const [disconnectMessage, setDisconnectMessage] = useState(null);

  const TAB_KEY = 'kirworld_active_tab';

  useEffect(() => {
    if (playerName === null) return;
    const tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const claim = () => localStorage.setItem(TAB_KEY, tabId);
    claim();

    function onStorage(e) {
      if (e.key === TAB_KEY && e.newValue !== tabId) {
        clearSession();
        setPlayerName(null);
        setDisconnectMessage('Disconnected. This session is now active in another tab.');
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') claim();
    }
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      localStorage.removeItem(TAB_KEY);
    };
  }, [playerName]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = getSession();
      if (!session?.token) {
        if (!cancelled) setChecking(false);
        return;
      }
      if (localStorage.getItem(TAB_KEY)) {
        if (!cancelled) {
          setDisconnectMessage('Session is active in another tab. Sign in here to use this tab (the other tab will be disconnected).');
          setChecking(false);
        }
        return;
      }
      const user = await validateSession();
      if (cancelled) return;
      if (user?.username) setPlayerName(user.username);
      else {
        clearSession();
        setDisconnectMessage('This account is now logged in on another browser or device. Please sign in again.');
      }
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (playerName === null) return;
    const interval = setInterval(async () => {
      const session = getSession();
      if (!session?.token) return;
      const user = await validateSession();
      if (!user) {
        clearSession();
        setPlayerName(null);
        setDisconnectMessage('Disconnected. This account is now logged in on another browser or device. Please sign in again.');
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [playerName]);

  function handleLogout() {
    clearSession();
    setPlayerName(null);
    setDisconnectMessage(null);
  }

  function clearDisconnectMessage() {
    setDisconnectMessage(null);
  }

  if (checking) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <h1>KIRWORLD</h1>
            <p>Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (playerName === null) {
    return (
      <AuthEntry
        onSuccess={({ username }) => { setDisconnectMessage(null); setPlayerName(username); }}
        disconnectMessage={disconnectMessage}
        onDismissDisconnectMessage={clearDisconnectMessage}
      />
    );
  }
  function handleSessionRevoked() {
    clearSession();
    setPlayerName(null);
    setDisconnectMessage('This account is now logged in on another browser or device. Please sign in again.');
  }

  return (
    <GameArea
      playerName={playerName}
      onLogout={handleLogout}
      onSessionRevoked={handleSessionRevoked}
    />
  );
}
