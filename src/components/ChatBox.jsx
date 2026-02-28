import { useState, useRef, useEffect } from 'react';
import '../styles/ChatBox.css';

export default function ChatBox({ messages, onSend, myId, playerCount = 0 }) {
  const [input, setInput] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key?.toLowerCase() !== 'c') return;
      const el = document.activeElement;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
      e.preventDefault();
      setDesktopCollapsed(false);
      setMobileOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed && onSend) {
      onSend(trimmed);
      setInput('');
    }
  }

  return (
    <>
      <button
        type="button"
        className="chatbox-bubble"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label={mobileOpen ? 'Close chat' : 'Open chat'}
        aria-expanded={mobileOpen}
        title="Chat (c)"
      >
        <span className="chatbox-bubble-icon">{mobileOpen ? '×' : '💬'}</span>
      </button>
      <div
        className={`chatbox ${mobileOpen ? 'chatbox--open' : ''} ${desktopCollapsed ? 'chatbox--collapsed' : ''}`}
      >
        <button
          type="button"
          className="chatbox-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close chat"
        >
          ×
        </button>
        <div className="chatbox-header" title="Chat (c)">
          <span className="chatbox-header-title">Chat</span>
          <div className="chatbox-header-right">
            <span className="chatbox-player-count" aria-live="polite">
              <span className="chatbox-player-count-dot" aria-hidden />
              {playerCount} {playerCount === 1 ? 'player' : 'players'}
            </span>
            <button
            type="button"
            className="chatbox-toggle"
            onClick={() => setDesktopCollapsed((c) => !c)}
            aria-label={desktopCollapsed ? 'Expand chat' : 'Collapse chat'}
            aria-expanded={!desktopCollapsed}
          >
            {desktopCollapsed ? '▲' : '▼'}
          </button>
          </div>
        </div>
        <ul className="chatbox-list" ref={listRef} aria-label="Chat messages">
          {messages.map((msg, i) => (
            <li
              key={`${msg.id}-${i}-${msg.text}`}
              className={`chatbox-msg ${msg.system ? 'chatbox-msg--system' : ''} ${msg.id === myId ? 'chatbox-msg--own' : ''} ${msg.dev ? 'chatbox-msg--dev' : ''}`}
            >
              {msg.system ? (
                <span className={`chatbox-system ${msg.dev ? 'chatbox-system--dev' : ''}`}>{msg.name} {msg.text}</span>
              ) : (
                <>
                  <span className={`chatbox-name ${msg.dev ? 'chatbox-name--dev' : ''}`}>{msg.name}:</span>{' '}
                  <span className="chatbox-text">{msg.text}</span>
                </>
              )}
            </li>
          ))}
        </ul>
        <form className="chatbox-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="chatbox-input"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={200}
            aria-label="Chat message"
          />
          <button type="submit" className="chatbox-send" aria-label="Send message">
            Send
          </button>
        </form>
      </div>
    </>
  );
}
