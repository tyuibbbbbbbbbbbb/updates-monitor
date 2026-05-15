// סקרייפר יוטיוב למוזיקה חרדית דרך YouTube Data API v3 (Search)
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API_KEY = "AIzaSyB52wOQveTGV3L4yaTVB4yeBq58R463TCo";
const GITHUB_USER = "tyuibbbbbbbbbbbb";
const GITHUB_REPO = "updates-monitor";
const GITHUB_BRANCH = "main";
const IMAGES_DIR = path.join(__dirname, "data", "images");
const LAST_CHECK_FILE = path.join(__dirname, "data", "yt-last-check.json");

// שאילתות חיפוש – כל אחת מחזירה סרטונים אחרונים רלוונטיים
const SEARCH_QUERIES = [
  "jewish music new 2026",
  "מוזיקה חרדית חדש",
  "TYH Nation",
  "נחמן פילמר",
  "Shiezoli jewish",
  "motty steinmetz",
  "shmueli ungar",
  "ishay ribo ישי ריבו",
  "beri weber",
  "mordechai shapiro",
  "simcha leiner",
  "yaakov shwekey",
  "avraham fried",
  "jewish music AI",
  "lipa schmeltzer",
];

// כל כמה דקות לבדוק מחדש (חסכון ב-API quota – 10,000/יום)
const CHECK_INTERVAL_MIN = 60;

function hash(s) {
  return crypto.createHash("md5").update(s).digest("hex").slice(0, 12);
}

function apiGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "UpdatesMonitor/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return apiGet(res.headers.location).then(resolve, reject);
      }
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON: " + data.slice(0, 200))); }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : require("http");
    lib.get(url, { headers: { "User-Agent": "UpdatesMonitor/1.0" }, timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("timeout", () => reject(new Error("timeout"))).on("error", reject);
  });
}

// בדיקה אם צריך לרוץ (לא לבדוק לעיתים קרובות מדי)
function shouldCheck() {
  try {
    if (fs.existsSync(LAST_CHECK_FILE)) {
      const data = JSON.parse(fs.readFileSync(LAST_CHECK_FILE, "utf8"));
      const elapsed = Date.now() - new Date(data.lastCheck).getTime();
      return elapsed > CHECK_INTERVAL_MIN * 60 * 1000;
    }
  } catch {}
  return true;
}

function saveCheckTime() {
  fs.writeFileSync(LAST_CHECK_FILE, JSON.stringify({ lastCheck: new Date().toISOString() }));
}

// שליפת סרטונים אחרונים מערוץ דרך uploads playlist
async function getChannelVideos(channelId, channelName, maxResults = 3) {
  const uploadsId = "UU" + channelId.slice(2); // UC... -> UU...
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=${maxResults}&key=${API_KEY}`;

  try {
    const data = await apiGet(url);
    if (!data.items || data.items.length === 0) return [];

    const videos = [];
    for (const item of data.items) {
      const snippet = item.snippet;
      if (!snippet || !snippet.resourceId) continue;

      const videoId = snippet.resourceId.videoId;
      const title = snippet.title || "";
      const publishedAt = snippet.publishedAt || "";
      const thumbnail = snippet.thumbnails?.high?.url ||
                        snippet.thumbnails?.medium?.url ||
                        snippet.thumbnails?.default?.url || "";

      videos.push({
        videoId,
        title,
        channelName,
        channelId,
        publishedAt,
        thumbnailUrl: thumbnail,
      });
    }
    return videos;
  } catch (e) {
    console.log(`  ⚠ YouTube: שגיאה בערוץ ${channelName}: ${e.message}`);
    return [];
  }
}

// הורדת תמונת thumbnail לריפו
async function downloadThumbnail(thumbnailUrl) {
  if (!thumbnailUrl) return null;
  try {
    const filename = hash(thumbnailUrl) + ".jpg";
    const filepath = path.join(IMAGES_DIR, filename);

    if (fs.existsSync(filepath)) {
      return `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/images/${filename}`;
    }

    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

    const buffer = await downloadFile(thumbnailUrl);
    if (buffer.length > 500) {
      fs.writeFileSync(filepath, buffer);
      return `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/images/${filename}`;
    }
  } catch (e) {
    console.log(`  ⚠ YouTube: שגיאה בהורדת thumbnail: ${e.message}`);
  }
  return thumbnailUrl; // fallback לכתובת מקורית
}

// סריקה ראשית – מחזירה רשימת פריטים בפורמט התואם ל-updates.json
async function scrapeYouTube() {
  if (!shouldCheck()) {
    console.log("  ⏭ YouTube: עדיין לא עבר מספיק זמן מהבדיקה האחרונה, מדלג.");
    return null; // null = לא לעדכן
  }

  console.log(`  🎵 YouTube: בודק ${CHANNELS.length} ערוצים...`);
  const allVideos = [];

  for (const ch of CHANNELS) {
    const videos = await getChannelVideos(ch.id, ch.name);
    allVideos.push(...videos);
  }

  console.log(`  🎵 YouTube: נמצאו ${allVideos.length} סרטונים`);

  // הורדת thumbnails
  const items = [];
  for (const v of allVideos) {
    const thumbUrl = await downloadThumbnail(v.thumbnailUrl);

    items.push({
      id: hash(v.videoId),
      title: v.title,
      link: `https://www.youtube.com/watch?v=${v.videoId}`,
      body: `🎵 ${v.channelName}`,
      images: thumbUrl ? [thumbUrl] : undefined,
      youtubeId: v.videoId,
      time: v.publishedAt ? new Date(v.publishedAt).toLocaleString("he-IL") : null,
      channelName: v.channelName,
      position: 0,
      sourceId: "youtube",
      sourceName: "מוזיקה חרדית",
      sourceIcon: "🎵",
      sourceColor: "#dc2626",
      sourceUrl: "https://www.youtube.com/",
    });
  }

  saveCheckTime();
  return items;
}

module.exports = { scrapeYouTube };
