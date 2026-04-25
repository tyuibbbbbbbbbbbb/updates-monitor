// שרת מקומי – קורא נתונים שכבר נסרקו ע"י GitHub Actions
// (כדי לעקוף את חסימת נטפרי – raw.githubusercontent.com לא חסום)

const express = require("express");
const path = require("path");
const fs = require("fs");
const axios = require("axios");

const PORT = process.env.PORT || 3000;
const REFRESH_MINUTES = Number(process.env.REFRESH_MINUTES || 5);

// כתובת קובץ ה-JSON שמתעדכן ע"י GitHub Actions
const GITHUB_USER = process.env.GITHUB_USER || "tyuibbbbbbbbbbbb";
const GITHUB_REPO = process.env.GITHUB_REPO || "updates-monitor";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const DATA_URL =
  process.env.DATA_URL ||
  `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/updates.json`;

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
  return {
    data: null,
    lastFetch: null,
    lastError: null,
  };
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.error("שגיאה בשמירת state:", e.message);
  }
}

async function fetchData() {
  console.log(`[${new Date().toISOString()}] מוריד נתונים מ-${DATA_URL}`);
  try {
    const res = await axios.get(DATA_URL, {
      timeout: 30000,
      headers: {
        "User-Agent": "updates-monitor-local/1.0",
        "Accept": "application/json",
        "Cache-Control": "no-cache",
      },
      // bust CDN cache
      params: { _t: Date.now() },
      transformResponse: [(data) => data],
    });
    let payload;
    try {
      payload = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    } catch (e) {
      throw new Error("התשובה אינה JSON תקין (אולי הקובץ עדיין לא נוצר ב-Actions?)");
    }
    state.data = payload;
    state.lastFetch = new Date().toISOString();
    state.lastError = null;
    saveState();
    console.log(`  ✓ ${payload.items?.length || 0} פריטים, נוצר ב-${payload.generatedAt}`);
    return payload;
  } catch (e) {
    state.lastError = e.message;
    state.lastFetch = new Date().toISOString();
    saveState();
    console.error(`  ✗ שגיאה: ${e.message}`);
    throw e;
  }
}

// API
app.get("/api/updates", (req, res) => {
  const data = state.data || { items: [], sources: [], generatedAt: null, errors: null };
  // מסמן פריטים שראינו ב-24 שעות האחרונות כ"חדש"
  const items = (data.items || []).map((it) => ({
    ...it,
    isNew:
      it.firstSeen &&
      Date.now() - new Date(it.firstSeen).getTime() < 24 * 60 * 60 * 1000,
  }));
  res.json({
    lastCheck: data.generatedAt,        // מתי GitHub Actions סרק לאחרונה
    lastFetch: state.lastFetch,         // מתי השרת המקומי הוריד לאחרונה
    pollMinutes: REFRESH_MINUTES,
    sources: data.sources || [],
    items,
    upstreamErrors: data.errors || null,
    fetchError: state.lastError,
    dataUrl: DATA_URL,
  });
});

app.post("/api/refresh", async (req, res) => {
  try {
    await fetchData();
    res.json({ ok: true, lastFetch: state.lastFetch });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, lastFetch: state.lastFetch });
});

// Polling – מוריד את ה-JSON מ-GitHub כל X דקות
setInterval(() => {
  fetchData().catch(() => {});
}, REFRESH_MINUTES * 60 * 1000);

// הורדה ראשונית
fetchData().catch(() => {});

app.listen(PORT, () => {
  console.log(`🚀 השרת רץ על http://localhost:${PORT}`);
  console.log(`   מוריד נתונים מ-GitHub כל ${REFRESH_MINUTES} דקות`);
  console.log(`   מקור: ${DATA_URL}`);
});
