import { useState, useRef, useEffect } from 'react';
import '../styles/ChatBox.css';

export default function ChatBox({ messages, onSend, onFind, myId, playerCount = 0 }) {
  const [input, setInput] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const CHAT_COLORS = {
    '0': '#ffffff',
    '1': '#adf4ff',
    '2': '#49fc00',
    '3': '#bfdaff',
    '4': '#ff271d',
    '5': '#ebb7ff',
    '6': '#ffca6f',
    '7': '#e6e6e6',
    '8': '#ff9445',
    '9': '#ffee7d',
    '!': '#d1fff9',
    '@': '#ffcdc9',
    '#': '#ff8ff3',
    '$': '#fffcc5',
    '^': '#b5ff97',
    '&': '#feebff',
    w: '#ffffff',
    o: '#fce6ba',
    p: '#ffdff1',
    b: '#000000',
    q: '#0c60a4',
    e: '#19b9ff',
    r: '#6fd357',
    t: '#2f830d',
    a: '#515151',
    s: '#9e9e9e',
    c: '#50ffff',
    ì: '#ffe119',
  };

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function caretCharacterOffsetWithin(el) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  }

  function setCaretCharacterOffsetWithin(el, offset) {
    const sel = window.getSelection();
    if (!sel) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let remaining = offset;
    let node = walker.nextNode();
    while (node) {
      const len = node.nodeValue?.length ?? 0;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      remaining -= len;
      node = walker.nextNode();
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function scrollCaretIntoViewWithMargin(el, marginPx = 10) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || !Number.isFinite(rect.left)) return;

    const elRect = el.getBoundingClientRect();
    const left = rect.left - elRect.left;
    const right = rect.right - elRect.left;

    if (left < marginPx) {
      el.scrollLeft -= marginPx - left;
    } else if (right > elRect.width - marginPx) {
      el.scrollLeft += right - (elRect.width - marginPx);
    }
  }

  function buildColoredHTML(rawText) {
    const text = String(rawText ?? '');
    let currentColor = CHAT_COLORS['0'];
    let runColor = currentColor;
    let run = '';
    let html = '';

    const flushRun = () => {
      if (!run) return;
      html += `<span style="color:${runColor}">${escapeHtml(run)}</span>`;
      run = '';
    };

    const marker = (ch) => `<span class="chatbox-preview-marker">${escapeHtml(ch)}</span>`;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '`') {
        const next = i + 1 < text.length ? text[i + 1] : '';
        if (next && Object.prototype.hasOwnProperty.call(CHAT_COLORS, next)) {
          flushRun();
          html += marker('`');
          html += marker(next);
          currentColor = CHAT_COLORS[next];
          runColor = currentColor;
          i += 1;
          continue;
        }
        flushRun();
        html += marker('`');
        continue;
      }

      run += ch;
    }

    flushRun();
    return html;
  }

  function syncEditableFromState(nextText) {
    const el = inputRef.current;
    if (!el) return;
    const currentPlain = el.textContent ?? '';
    if (currentPlain === nextText) return;
    const html = buildColoredHTML(nextText);
    el.innerHTML = html;
  }

  useEffect(() => {
    syncEditableFromState(input);
  }, [input]);

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
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (/^\/find(\s|$)/.test(lower)) {
      onFind?.();
      setInput('');
      return;
    }
    if (onSend) onSend(trimmed);
    setInput('');
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
            <button
              type="button"
              className="chatbox-close"
              onClick={() => setMobileOpen(false)}
              aria-label="Close chat"
            >
              ×
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
                <span className={`chatbox-system ${msg.dev ? 'chatbox-system--dev' : ''}`}>{typeof msg.name === 'string' ? msg.name : 'Player'} {msg.text}</span>
              ) : (
                <>
                  <span className={`chatbox-name ${msg.dev ? 'chatbox-name--dev' : ''}`}>{typeof msg.name === 'string' ? msg.name : 'Player'}:</span>{' '}
                  {Array.isArray(msg.segments) && msg.segments.length > 0 ? (
                    <span className="chatbox-text">
                      {msg.segments.map((seg, segIdx) => (
                        <span key={`${msg.id}-${i}-seg-${segIdx}`} style={typeof seg?.color === 'string' ? { color: seg.color } : undefined}>
                          {String(seg?.text || '')}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="chatbox-text" style={typeof msg.color === 'string' ? { color: msg.color } : undefined}>{msg.text}</span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        <form className="chatbox-form" onSubmit={handleSubmit}>
          <div
            ref={inputRef}
            className="chatbox-contenteditable"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="Chat message"
            data-placeholder="Type a message..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                e.preventDefault();
                e.currentTarget.closest('form')?.requestSubmit?.();
                return;
              }
              if (e.key === 'Tab') {
                e.preventDefault();
              }
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              const caretOffset = caretCharacterOffsetWithin(el);
              let rawText = el.textContent ?? '';
              if (rawText.length > 200) rawText = rawText.slice(0, 200);
              setInput(rawText);
              el.innerHTML = buildColoredHTML(rawText);
              setCaretCharacterOffsetWithin(el, Math.min(caretOffset, rawText.length));
              scrollCaretIntoViewWithMargin(el, 10);
            }}
          />
          <button type="submit" className="chatbox-send" aria-label="Send message">
            Send
          </button>
        </form>
      </div>
    </>
  );
}
