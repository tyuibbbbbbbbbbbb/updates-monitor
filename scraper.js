const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: 30000,
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
    responseType: "arraybuffer",
    validateStatus: (s) => s < 500,
    decompress: true,
  });
  const buf = Buffer.from(res.data);
  const ctype = (res.headers["content-type"] || "").toLowerCase();
  let html;
  if (ctype.includes("charset=windows-1255") || ctype.includes("charset=iso-8859-8")) {
    html = buf.toString("latin1");
  } else {
    html = buf.toString("utf8");
  }
  // זיהוי חסימת נטפרי / סינון ברשת
  if (html.includes("netfree.link") && html.length < 2000) {
    const err = new Error("הרשת מסוננת (נטפרי) – האתר נחסם. יש להריץ את השרת מרשת פתוחה / שרת ענן.");
    err.code = "NETWORK_BLOCKED";
    throw err;
  }
  if (res.status >= 400) {
    throw new Error(`HTTP ${res.status}`);
  }
  return html;
}

function extractItems($, source) {
  const items = [];
  const seen = new Set();

  for (const selector of source.selectors) {
    const els = $(selector);
    if (els.length === 0) continue;

    els.each((_, el) => {
      const $el = $(el);
      let title = "";
      let link = "";
      let body = "";

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

      items.push({
        id: hash(key),
        title,
        link: link || source.url,
        body: body || "",
      });
    });

    if (items.length > 0) break;
  }

  // Fallback: תוכן גולמי של ה-body
  if (items.length === 0 && source.fallbackText) {
    const text = $("body").text().replace(/\s+/g, " ").trim();
    if (text) {
      const snippet = text.slice(0, 500);
      items.push({
        id: hash(snippet),
        title: source.name + " – עודכן",
        link: source.url,
        body: snippet,
      });
    }
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

module.exports = { scrapeSource };
