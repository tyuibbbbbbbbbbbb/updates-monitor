const chatEl = document.getElementById('chat');
const form = document.getElementById('chat-form');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');

const settingsBtn = document.getElementById('settings-btn');
const settingsOverlay = document.getElementById('settings-overlay');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const keyStatus = document.getElementById('key-status');

let messages = JSON.parse(localStorage.getItem('chat-history') || '[]');
let apiKey = localStorage.getItem('api-key') || '';

function openSettings() {
  apiKeyInput.value = apiKey;
  keyStatus.textContent = apiKey ? 'יש מפתח שמור.' : 'אין מפתח שמור עדיין.';
  settingsOverlay.classList.remove('hidden');
  apiKeyInput.focus();
}

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
saveKeyBtn.addEventListener('click', () => {
  apiKey = apiKeyInput.value.trim();
  localStorage.setItem('api-key', apiKey);
  keyStatus.textContent = apiKey ? 'המפתח נשמר!' : 'המפתח נמחק.';
  setTimeout(() => settingsOverlay.classList.add('hidden'), 600);
});

function save() {
  localStorage.setItem('chat-history', JSON.stringify(messages));
}

function addBubble(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function render() {
  chatEl.innerHTML = '';
  messages.forEach((m) => addBubble(m.role, m.content));
}

async function send(text) {
  if (!apiKey) {
    openSettings();
    return;
  }
  messages.push({ role: 'user', content: text });
  save();
  addBubble('user', text);
  sendBtn.disabled = true;
  const typing = addBubble('assistant typing', '...כותב');
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, apiKey }),
    });
    const data = await res.json();
    typing.remove();
    if (!res.ok) {
      if (data.error === 'bad_key' || data.error === 'missing_key') {
        addBubble('assistant', 'המפתח לא תקין או חסר. לחץ על "מפתח API" למעלה והדבק מפתח.');
        return;
      }
      throw new Error(data.error || 'error');
    }
    messages.push({ role: 'assistant', content: data.reply });
    save();
    addBubble('assistant', data.reply);
  } catch (err) {
    typing.remove();
    addBubble('assistant', 'שגיאה: השירות אינו זמין כרגע. נסה שוב.');
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  send(text);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

clearBtn.addEventListener('click', () => {
  messages = [];
  save();
  render();
});

render();
