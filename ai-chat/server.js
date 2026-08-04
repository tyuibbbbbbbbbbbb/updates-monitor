const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const SYSTEM_PROMPT = 'אתה עוזר AI ידידותי. ענה בשפה שבה המשתמש כותב אליך.';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function askOpenAI(messages, apiKey) {
  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function askGemini(messages, apiKey) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.candidates[0].content.parts.map((p) => p.text).join('');
}

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, apiKey } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    const trimmed = messages.slice(-20).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 4000),
    }));
    const key = String(apiKey || '').trim() || GEMINI_API_KEY || OPENAI_API_KEY;
    let reply;
    if (!key) {
      return res.status(400).json({ error: 'missing_key' });
    } else if (key.startsWith('sk-')) {
      reply = await askOpenAI(trimmed, key);
    } else {
      reply = await askGemini(trimmed, key);
    }
    res.json({ reply });
  } catch (err) {
    console.error(err);
    const msg = String(err.message || '');
    if (msg.includes(' 400') || msg.includes(' 401') || msg.includes(' 403')) {
      return res.status(401).json({ error: 'bad_key' });
    }
    res.status(502).json({ error: 'unavailable' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`AI chat server listening on port ${PORT}`);
});
