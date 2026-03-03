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
  const TAB_ID_KEY = 'kirworld_tab_id';
  const TAB_HEARTBEAT_MS = 2000;
  const TAB_STALE_MS = 8000;

  function getTabId() {
    let id = sessionStorage.getItem(TAB_ID_KEY);
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(TAB_ID_KEY, id);
    }
    return id;
  }

  function readActiveTab() {
    const raw = localStorage.getItem(TAB_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (typeof parsed.tabId !== 'string') return null;
      if (typeof parsed.ts !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeActiveTab(tabId) {
    localStorage.setItem(TAB_KEY, JSON.stringify({ tabId, ts: Date.now() }));
  }

  useEffect(() => {
    if (playerName === null) return;
    const tabId = getTabId();
    const claim = () => writeActiveTab(tabId);
    claim();
    const heartbeat = setInterval(claim, TAB_HEARTBEAT_MS);

    function onStorage(e) {
      if (e.key === TAB_KEY) {
        const active = readActiveTab();
        if (!active) return;
        if (active.tabId !== tabId) {
          clearSession();
          setPlayerName(null);
          setDisconnectMessage('Disconnected. This session is now active in another tab.');
        }
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') claim();
    }
    function onBeforeUnload() {
      const active = readActiveTab();
      if (active?.tabId === tabId) localStorage.removeItem(TAB_KEY);
    }
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
      const active = readActiveTab();
      if (active?.tabId === tabId) localStorage.removeItem(TAB_KEY);
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

      const tabId = getTabId();
      const active = readActiveTab();
      const isActiveFresh = active && (Date.now() - active.ts < TAB_STALE_MS);
      const isOwnedByOtherTab = isActiveFresh && active.tabId !== tabId;

      if (isOwnedByOtherTab) {
        if (!cancelled) {
          setDisconnectMessage('Session is active in another tab. Sign in here to use this tab (the other tab will be disconnected).');
          setChecking(false);
        }
        return;
      }

      writeActiveTab(tabId);

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
