const cheerio = require("cheerio");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const GITHUB_USER = "tyuibbbbbbbbbbbb";
const GITHUB_REPO = "updates-monitor";
const GITHUB_BRANCH = "main";
const IMAGES_DIR = path.join(__dirname, "data", "images");

// משתמשים ב-Puppeteer רק אם הוא זמין (מותקן רק ב-GitHub Actions / סביבת סריקה)
let puppeteer = null;
try { puppeteer = require("puppeteer"); } catch {}

function hash(s) {
  return crypto.createHash("md5").update(s).digest("hex").slice(0, 12);
}

function absoluteUrl(href, base) {
  if (!href) return "";
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

// browser singleton – נפתח פעם אחת לכל הסריקות
let _browser = null;
async function getBrowser() {
  if (!puppeteer) throw new Error("Puppeteer לא מותקן (חסר ב-deps)");
  if (_browser) return _browser;
  _browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--lang=he-IL",
    ],
  });
  return _browser;
}

async function closeBrowser() {
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }
}

async function fetchHtml(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({
      "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
    });
    await page.setViewport({ width: 1366, height: 900 });

    const response = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });

    // המתנה נוספת קצרה לטעינה דינמית של רשימות
    await new Promise((r) => setTimeout(r, 2500));

    const html = await page.content();

    if (html.includes("netfree.link") && html.length < 3000) {
      const err = new Error(
        "הרשת מסוננת (נטפרי) – האתר נחסם. יש להריץ את השרת מרשת פתוחה / שרת ענן."
      );
      err.code = "NETWORK_BLOCKED";
      throw err;
    }
    if (response && response.status() >= 400) {
      throw new Error(`HTTP ${response.status()}`);
    }
    return html;
  } finally {
    await page.close().catch(() => {});
  }
}

function firstText($el, selectors) {
  for (const sel of selectors || []) {
    const t = $el.find(sel).first().text().replace(/\s+/g, " ").trim();
    if (t) return t;
  }
  return "";
}

function extractFeedItems($, source) {
  const items = [];
  const seen = new Set();

  // הסרת אלמנטים מפריעים (אוברליי הרשמה, תפריטים וכו')
  const excludeSelectors = source.excludeSelectors || [
    "[class*='media-auth-overlay']",
    "[class*='auth-overlay']",
    "[class*='overlay']",
    "button",
    ".message-actions-bar",
    "[class*='emoji-reaction']",
    "[class*='reaction']",
  ];
  for (const sel of excludeSelectors) $(sel).remove();

  // ביטויי ניקוי טקסט – מסירים משפטים של התחברות/שכבת הגנה שלא נעלמו דרך selectors
  const junkPatterns = source.junkPatterns || [
    /יש להתחבר כדי לצפות בקבצים\s*(לחצו כאן להתחברות)?\s*/g,
    /לחצו כאן להתחברות/g,
    /Sign in to view files/gi,
  ];

  $(source.itemSelector).each((idx, el) => {
    const $el = $(el);
    let content =
      firstText($el, source.contentSelectors) ||
      $el.text().replace(/\s+/g, " ").trim();
    // ניקוי רצפי אמוג'י+מספרים (ספירת תגובות)
    content = content.replace(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])\d+/gu, "$1");
    // ניקוי טקסטי junk
    for (const p of junkPatterns) content = content.replace(p, " ");
    content = content.replace(/\s+/g, " ").trim();

    // חילוץ תמונות – רק מאזור התוכן, מתעלם מאווטאר/לוגו
    const avatarSelectors = source.excludeImageSelectors || [
      "[class*='avatar']",
      "[class*='logo']",
      "[class*='profile']",
      "[class*='channel-image']",
      ".message-avatar",
      ".user-avatar",
    ];
    const avatarSel = avatarSelectors.join(",");
    const images = [];

    // מחפש תמונות רק בתוך אזור התוכן (לא כל ה-message שכולל אווטאר)
    const $contentArea = source.contentSelectors
      ? (() => {
          for (const sel of source.contentSelectors) {
            const $c = $el.find(sel);
            if ($c.length > 0) return $c;
          }
          return $el;
        })()
      : $el;

    $contentArea.find("img").each((_, img) => {
      const $img = $(img);
      if ($img.closest(avatarSel).length > 0) return;
      const cls = ($img.attr("class") || "").toLowerCase();
      if (cls.includes("avatar") || cls.includes("logo") || cls.includes("profile")) return;
      const src = $img.attr("src") || $img.attr("data-src") || "";
      if (src && !src.startsWith("data:") && src.length > 5) {
        images.push(absoluteUrl(src, source.url));
      }
    });
    $contentArea.find("[style*='background-image']").each((_, el2) => {
      const $bgEl = $(el2);
      if ($bgEl.closest(avatarSel).length > 0) return;
      const cls2 = ($bgEl.attr("class") || "").toLowerCase();
      if (cls2.includes("avatar") || cls2.includes("logo") || cls2.includes("profile")) return;
      const style = $bgEl.attr("style") || "";
      const m = style.match(/url\(['"]?([^)'"]+)['"]?\)/);
      if (m && m[1] && !m[1].startsWith("data:")) {
        images.push(absoluteUrl(m[1], source.url));
      }
    });

    // חילוץ סרטונים
    const videos = [];
    $contentArea.find("video source, video[src]").each((_, vid) => {
      const $vid = $(vid);
      const src = $vid.attr("src") || "";
      if (src && !src.startsWith("data:") && src.length > 5) {
        videos.push(absoluteUrl(src, source.url));
      }
    });
    // לינקים לקבצי וידאו
    $contentArea.find("a[href]").each((_, a) => {
      const href = $(a).attr("href") || "";
      if (/\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(href)) {
        videos.push(absoluteUrl(href, source.url));
      }
    });

    // אם אין תוכן טקסטואלי ואין תמונות ואין סרטונים - דלג
    if ((!content || content.length < 3) && images.length === 0 && videos.length === 0) return;

    const time = firstText($el, source.timeSelectors);
    const channelName = firstText($el, source.titleSelectors);

    const firstLine = (content || "").split(/\n|(?<=[.!?])\s+/)[0].trim();
    const title = (firstLine || content || "תמונה").slice(0, 120);
    const body = (content || "").slice(0, 400);

    // ID יציב לפי תוכן ההודעה
    const id = hash((content || images[0] || "").slice(0, 200));
    if (seen.has(id)) return;
    seen.add(id);

    items.push({
      id,
      title,
      link: source.url + `#msg-${id}`,
      body,
      images: images.length > 0 ? images : undefined,
      videos: videos.length > 0 ? videos : undefined,
      time: time || null,
      channelName: channelName || null,
      position: idx,
    });
  });

  return items.slice(0, source.limit || 25);
}

function extractItems($, source) {
  if (source.mode === "feed" && source.itemSelector) {
    return extractFeedItems($, source);
  }
  const items = [];
  const seen = new Set();
  for (const selector of source.selectors || []) {
    const els = $(selector);
    if (els.length === 0) continue;
    els.each((_, el) => {
      const $el = $(el);
      let title = "", link = "", body = "";
      if (el.name === "a") {
        title = $el.text().replace(/\s+/g, " ").trim();
        link = absoluteUrl($el.attr("href"), source.url);
      } else {
        const a = $el.find("a").first();
        title =
          $el.find("h1,h2,h3,h4,.title").first().text().trim() ||
          a.text().trim() ||
          $el.text().slice(0, 120).trim();
        link = absoluteUrl(a.attr("href"), source.url);
        body = $el.text().replace(/\s+/g, " ").trim().slice(0, 300);
      }
      if (!title || title.length < 3) return;
      const key = (title + "|" + link).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ id: hash(key), title, link: link || source.url, body });
    });
    if (items.length > 0) break;
  }
  return items.slice(0, source.limit || 25);
}

async function scrapeSource(source) {
  const html = await fetchHtml(source.url);
  const $ = cheerio.load(html);
  const items = extractItems($, source);
  return {
    items: items.map((it) => ({
      ...it,
      sourceId: source.id,
      sourceName: source.name,
      sourceIcon: source.icon,
      sourceColor: source.color,
      sourceUrl: source.url,
    })),
    rawHtml: html,
  };
}

// הורדת תמונה ושמירה לריפו – מחזירה URL של GitHub raw
async function downloadImage(imageUrl) {
  if (!puppeteer) return imageUrl; // fallback
  try {
    const ext = (imageUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)/i) || [, "jpg"])[1];
    const filename = hash(imageUrl) + "." + ext;
    const filepath = path.join(IMAGES_DIR, filename);

    // אם כבר הורד – לא מוריד שוב
    if (fs.existsSync(filepath)) {
      return `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/images/${filename}`;
    }

    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      const response = await page.goto(imageUrl, { timeout: 15000, waitUntil: "load" });
      if (response && response.ok()) {
        const buffer = await response.buffer();
        if (buffer.length > 100) { // לא שומרים תמונות ריקות
          fs.writeFileSync(filepath, buffer);
          return `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/images/${filename}`;
        }
      }
    } finally {
      await page.close().catch(() => {});
    }
  } catch (e) {
    console.log(`  ⚠ לא ניתן להוריד תמונה: ${imageUrl.slice(0, 80)} (${e.message})`);
  }
  return null; // תמונה שלא הורדה – לא מציגים
}

// הורדת סרטון בשיטת HTTP ישיר (מהיר יותר מ-Puppeteer) ושמירה בסיומת .bin
const VIDEOS_DIR = path.join(__dirname, "data", "videos");
const MAX_VIDEO_SIZE = 15 * 1024 * 1024; // 15MB מקסימום

function httpGet(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { headers: { "User-Agent": UA }, timeout }, (res) => {
      // follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, timeout).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_VIDEO_SIZE) { res.destroy(); return reject(new Error("too-large")); }
        chunks.push(chunk);
      });
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
  });
}

async function downloadVideo(videoUrl) {
  try {
    const filename = hash(videoUrl) + ".bin";
    const filepath = path.join(VIDEOS_DIR, filename);

    if (fs.existsSync(filepath)) {
      return `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/videos/${filename}`;
    }

    if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

    const buffer = await httpGet(videoUrl);
    if (buffer.length > 1000) {
      fs.writeFileSync(filepath, buffer);
      return `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/videos/${filename}`;
    }
  } catch (e) {
    console.log(`  ⚠ לא ניתן להוריד סרטון: ${videoUrl.slice(0, 80)} (${e.message})`);
  }
  return null;
}

// הורדת כל המדיה (תמונות + סרטונים) של הפריטים
// מוגבל ל-3 דקות סה"כ כדי לא לחרוג מ-timeout של workflow
async function downloadItemMedia(items) {
  const startTime = Date.now();
  const MAX_TIME = 3 * 60 * 1000; // 3 דקות מקסימום

  for (const item of items) {
    if (Date.now() - startTime > MAX_TIME) {
      console.log("  ⏱ חריגה מזמן מקסימלי להורדת מדיה, עוצר.");
      break;
    }
    // תמונות
    if (item.images && item.images.length > 0) {
      const resolved = [];
      for (const url of item.images) {
        const newUrl = await downloadImage(url);
        if (newUrl) resolved.push(newUrl);
      }
      item.images = resolved.length > 0 ? resolved : undefined;
    }
    // סרטונים
    if (item.videos && item.videos.length > 0) {
      if (Date.now() - startTime > MAX_TIME) break;
      const resolved = [];
      for (const url of item.videos) {
        const newUrl = await downloadVideo(url);
        if (newUrl) resolved.push(newUrl);
      }
      item.videos = resolved.length > 0 ? resolved : undefined;
    }
  }
}

module.exports = { scrapeSource, closeBrowser, downloadItemMedia };
