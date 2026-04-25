const express = require("express");
const path = require("path");
const fs = require("fs");
const sources = require("./sources");
const { scrapeSource } = require("./scraper");

const PORT = process.env.PORT || 3000;
const POLL_MINUTES = Number(process.env.POLL_MINUTES || 10);
const STATE_FILE = path.join(__dirname, "state.json");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

let state = loadState();

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }
  } catch (e) {
    console.error("שגיאה בטעינת state:", e.message);
  }
  return { items: [], firstSeen: {}, lastCheck: null, lastError: null };
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.error("שגיאה בשמירת state:", e.message);
  }
}

async function refresh() {
  console.log(`[${new Date().toISOString()}] מתחיל סריקה...`);
  const collected = [];
  const errors = [];

  for (const src of sources) {
    try {
      const items = await scrapeSource(src);
      collected.push(...items);
      console.log(`  ✓ ${src.name}: ${items.length} פריטים`);
    } catch (e) {
      console.error(`  ✗ ${src.name}: ${e.message}`);
      errors.push({ source: src.name, error: e.message });
    }
  }

  const now = new Date().toISOString();
  for (const it of collected) {
    const key = it.sourceId + ":" + it.id;
    if (!state.firstSeen[key]) {
      state.firstSeen[key] = now;
    }
    it.firstSeen = state.firstSeen[key];
    it.isNew =
      Date.now() - new Date(it.firstSeen).getTime() < 24 * 60 * 60 * 1000;
  }

  collected.sort(
    (a, b) => new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime()
  );

  state.items = collected;
  state.lastCheck = now;
  state.lastError = errors.length ? errors : null;

  // ניקוי firstSeen מערכים שלא נראים יותר (>30 ימים)
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const k of Object.keys(state.firstSeen)) {
    if (new Date(state.firstSeen[k]).getTime() < cutoff) {
      delete state.firstSeen[k];
    }
  }

  saveState();
  console.log(`  סה"כ ${collected.length} פריטים, ${errors.length} שגיאות.`);
}

// API
app.get("/api/updates", (req, res) => {
  res.json({
    lastCheck: state.lastCheck,
    lastError: state.lastError,
    pollMinutes: POLL_MINUTES,
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      color: s.color,
      url: s.url,
    })),
    items: state.items,
  });
});

app.post("/api/refresh", async (req, res) => {
  try {
    await refresh();
    res.json({ ok: true, lastCheck: state.lastCheck });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, lastCheck: state.lastCheck });
});

// Polling
setInterval(() => {
  refresh().catch((e) => console.error("שגיאה בסריקה:", e.message));
}, POLL_MINUTES * 60 * 1000);

// סריקה ראשונית
refresh().catch((e) => console.error("שגיאה בסריקה ראשונית:", e.message));

app.listen(PORT, () => {
  console.log(`🚀 השרת רץ על http://localhost:${PORT}`);
  console.log(`   בדיקה אוטומטית כל ${POLL_MINUTES} דקות`);
});
