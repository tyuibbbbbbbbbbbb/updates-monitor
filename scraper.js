const cheerio = require("cheerio");
const crypto = require("crypto");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

  // הסרת אלמנטים מפריעים (אוברליי הרשמה, תפריטים וכו') לפני חילוץ טקסט
  const excludeSelectors = source.excludeSelectors || [
    ".media-auth-overlay",
    ".auth-overlay",
    "[class*='overlay']",
    "button",
    ".message-actions-bar",
    ".emoji-reaction",
  ];
  for (const sel of excludeSelectors) $(sel).remove();

  $(source.itemSelector).each((idx, el) => {
    const $el = $(el);
    let content =
      firstText($el, source.contentSelectors) ||
      $el.text().replace(/\s+/g, " ").trim();
    // ניקוי נוסף: הסרת רצפי אמוג'י+מספרים (ספירת תגובות)
    content = content.replace(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])\d+/gu, "$1").trim();
    if (!content || content.length < 3) return;

    const time = firstText($el, source.timeSelectors);
    const channelName = firstText($el, source.titleSelectors);

    const firstLine = content.split(/\n|(?<=[.!?])\s+/)[0].trim();
    const title = (firstLine || content).slice(0, 120);
    const body = content.slice(0, 400);

    // ID יציב לפי תוכן ההודעה
    const id = hash(content.slice(0, 200));
    if (seen.has(id)) return;
    seen.add(id);

    items.push({
      id,
      title,
      link: source.url + `#msg-${id}`,
      body,
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

module.exports = { scrapeSource, closeBrowser };
