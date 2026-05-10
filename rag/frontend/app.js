/* ═══════════════════════════════════════════
   NASA Artemis RAG Assistant — App Logic
   ═══════════════════════════════════════════ */

const API_BASE = 'http://localhost:8000';

// ── State ──
let sessionId = generateSessionId();
let isLoading = false;

// ── DOM refs ──
const messagesArea     = document.getElementById('messagesArea');
const userInput        = document.getElementById('userInput');
const sendBtn          = document.getElementById('sendBtn');
const sessionIdDisplay = document.getElementById('sessionIdDisplay');
const btnNewSession    = document.getElementById('btnNewSession');
const btnClearChat     = document.getElementById('btnClearChat');
const statusDot        = document.getElementById('statusDot');
const starsContainer   = document.getElementById('stars');

// ── Init ──
initStars();
updateSessionDisplay();
showWelcome();
bindEvents();

// ══════════════════════════════════════════
// STARS
// ══════════════════════════════════════════
function initStars() {
  for (let i = 0; i < 130; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size = Math.random() * 2.5 + 0.5;
    star.style.cssText = `
      left:    ${Math.random() * 100}%;
      top:     ${Math.random() * 100}%;
      width:   ${size}px;
      height:  ${size}px;
      --dur:   ${(Math.random() * 4 + 2).toFixed(1)}s;
      --delay: ${(Math.random() * 5).toFixed(1)}s;
      --max-op:${(Math.random() * 0.5 + 0.3).toFixed(2)};
    `;
    starsContainer.appendChild(star);
  }
}

// ══════════════════════════════════════════
// SESSION
// ══════════════════════════════════════════
function generateSessionId() {
  return 'sess-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

function updateSessionDisplay() {
  sessionIdDisplay.textContent = sessionId;
}

function newSession() {
  sessionId = generateSessionId();
  updateSessionDisplay();
  clearChat();
  showWelcome();
}

// ══════════════════════════════════════════
// WELCOME
// ══════════════════════════════════════════
function showWelcome() {
  messagesArea.innerHTML = `
    <div class="welcome-card">
      <div class="welcome-icon">🚀</div>
      <h2>NASA Artemis Plan Assistant</h2>
      <p>
        Ask me anything about the <strong>NASA Artemis Plan</strong> document.<br/>
        I can answer questions about mission goals, phases, the Gateway, 
        lunar surface operations, and more.<br/><br/>
        <em>I only respond based on the document — no guessing!</em>
      </p>
    </div>`;
}

function clearChat() {
  messagesArea.innerHTML = '';
}

// ══════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════
function bindEvents() {
  sendBtn.addEventListener('click', handleSend);
  btnNewSession.addEventListener('click', newSession);
  btnClearChat.addEventListener('click', () => { clearChat(); showWelcome(); });

  userInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-resize textarea
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  });

  // Suggestion chips
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.q;
      userInput.value = q;
      userInput.dispatchEvent(new Event('input'));
      handleSend();
    });
  });
}

// ══════════════════════════════════════════
// SEND
// ══════════════════════════════════════════
async function handleSend() {
  const text = userInput.value.trim();
  if (!text || isLoading) return;

  // Remove welcome card if present
  const welcome = messagesArea.querySelector('.welcome-card');
  if (welcome) welcome.remove();

  appendMessage('user', text);
  userInput.value = '';
  userInput.style.height = 'auto';

  setLoading(true);
  const typingId = showTyping();

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message: text }),
    });

    removeTyping(typingId);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      appendMessage('bot', `⚠️ Error ${res.status}: ${err.detail || 'Something went wrong.'}`);
      return;
    }

    const data = await res.json();
    appendMessage('bot', data.answer);
  } catch (err) {
    removeTyping(typingId);
    appendMessage('bot', `⚠️ Could not reach the server. Make sure the backend is running on port 8000.\n\n${err.message}`);
  } finally {
    setLoading(false);
  }
}

// ══════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════
function appendMessage(role, text) {
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🚀';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = formatText(text);

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesArea.appendChild(row);
  scrollToBottom();
}

function showTyping() {
  const id = 'typing-' + Date.now();
  const row = document.createElement('div');
  row.className = 'msg-row bot';
  row.id = id;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '🚀';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = `
    <div class="typing-indicator">
      <span></span><span></span><span></span>
    </div>`;

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesArea.appendChild(row);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function setLoading(state) {
  isLoading = state;
  sendBtn.disabled = state;

  const dot  = statusDot.querySelector('.dot');
  const text = statusDot.childNodes[statusDot.childNodes.length - 1];

  if (state) {
    dot.classList.add('thinking');
    statusDot.lastChild.textContent = ' Thinking…';
  } else {
    dot.classList.remove('thinking');
    statusDot.lastChild.textContent = ' Ready';
  }
}

function scrollToBottom() {
  messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: 'smooth' });
}

/**
 * Minimal markdown-like formatting:
 *  - **bold**
 *  - newlines → <br>
 *  - Page references highlighted
 */
function formatText(raw) {
  let html = raw
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Page references e.g. (Page 52)
    .replace(/\(Page (\d+)\)/g,
      '<span style="font-size:0.78rem;color:var(--accent);opacity:0.85;font-weight:500;">(Page $1)</span>')
    // Newlines
    .replace(/\n/g, '<br/>');

  return html;
}
