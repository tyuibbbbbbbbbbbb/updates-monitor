// סקריפט שרץ ב-GitHub Actions: סורק את האתרים ושומר ל-data/updates.json
// GitHub Actions רץ בשרתי ענן ולא מסונן, ולכן הסריקה תעבוד.

const fs = require("fs");
const path = require("path");
const sources = require("../sources");
const { scrapeSource, closeBrowser, downloadItemMedia } = require("../scraper");
const { scrapeYouTube } = require("../youtube-scraper");

const DATA_DIR = path.join(__dirname, "..", "data");
const OUT_FILE = path.join(DATA_DIR, "updates.json");
const PREV_FILE = path.join(DATA_DIR, "firstSeen.json");

function loadJson(p, fallback) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error("שגיאה בטעינת", p, ":", e.message);
  }
  return fallback;
}

(async () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const firstSeen = loadJson(PREV_FILE, {});
  const collected = [];
  const errors = [];

  for (const src of sources) {
    try {
      console.log(`סורק ${src.name}...`);
      const { items, rawHtml } = await scrapeSource(src);
      collected.push(...items);
      console.log(`  ✓ ${items.length} פריטים`);
      // אם לא נמצאו פריטים – שמור debug HTML כדי שנוכל לראות את המבנה
      if (items.length === 0 && rawHtml) {
        const debugFile = path.join(DATA_DIR, `debug-${src.id}.html`);
        fs.writeFileSync(debugFile, rawHtml.slice(0, 200000), "utf8");
        console.log(`  💾 נשמר debug ל-${debugFile} (${rawHtml.length} bytes)`);
      }
    } catch (e) {
      console.error(`  ✗ ${src.name}: ${e.message}`);
      errors.push({ source: src.name, error: e.message });
    }
  }

  // סריקת יוטיוב
  try {
    console.log("סורק YouTube...");
    const ytItems = await scrapeYouTube();
    if (ytItems) {
      collected.push(...ytItems);
      console.log(`  ✓ YouTube: ${ytItems.length} סרטונים`);
    }
  } catch (e) {
    console.error(`  ✗ YouTube: ${e.message}`);
    errors.push({ source: "YouTube", error: e.message });
  }

  // הורדת מדיה לריפו (תמונות + סרטונים – נגישות דרך נטפרי)
  console.log("מוריד מדיה...");
  await downloadItemMedia(collected);

  const now = new Date().toISOString();
  for (const it of collected) {
    const key = it.sourceId + ":" + it.id;
    if (!firstSeen[key]) firstSeen[key] = now;
    it.firstSeen = firstSeen[key];
  }
  // סדר כרונולוגי – ישן למעלה, חדש למטה
  collected.sort(
    (a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime()
  );

  // ניקוי firstSeen מערכים ישנים (>30 ימים)
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const validKeys = new Set(collected.map((it) => it.sourceId + ":" + it.id));
  for (const k of Object.keys(firstSeen)) {
    if (
      !validKeys.has(k) &&
      new Date(firstSeen[k]).getTime() < cutoff
    ) {
      delete firstSeen[k];
    }
  }

  const allSources = [
    ...sources.map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      color: s.color,
      url: s.url,
    })),
    { id: "youtube", name: "מוזיקה חרדית", icon: "🎵", color: "#dc2626", url: "https://www.youtube.com/" },
  ];

  const out = {
    generatedAt: now,
    sources: allSources,
    items: collected,
    errors,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  fs.writeFileSync(PREV_FILE, JSON.stringify(firstSeen, null, 2), "utf8");
  console.log(`\nנשמרו ${collected.length} פריטים, ${errors.length} שגיאות.`);
  await closeBrowser();
})().catch((e) => {
  console.error("שגיאה כללית:", e);
  process.exit(1);
});
