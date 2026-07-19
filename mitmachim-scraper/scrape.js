#!/usr/bin/env node
"use strict";

/**
 * mitmachim.top NodeBB forum scraper.
 *
 * Downloads the entire content of the forum through its public read API:
 *   - GET /api/categories            -> list of categories (with nested children)
 *   - GET /api/category/{cid}?page=N -> topics inside a category (paginated)
 *   - GET /api/topic/{tid}?page=N    -> posts inside a topic (paginated)
 *
 * The collected data is written as structured JSON on disk, one file per topic,
 * preserving fields like topic title, author, timestamps and post content.
 *
 * Uses only Node.js built-ins (global fetch, requires Node >= 18) so there are
 * no external dependencies to install.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------

const BASE_URL = "https://mitmachim.top";

// Realistic User-Agent (matches the constant used in updates-monitor/scraper.js).
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function parseArgs(argv) {
  const args = {
    out: path.join(__dirname, "data"),
    delay: 500, // ms between requests (rate limiting)
    retries: 4, // retry attempts per request
    timeout: 45000, // per-request timeout (ms)
    maxTopics: 0, // 0 = no limit
    categories: null, // e.g. "66,71" -> only these cids
    media: false, // download referenced media
    force: false, // re-scrape topics even if already saved
    concurrency: 1, // topics fetched in parallel
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--out": args.out = path.resolve(next()); break;
      case "--delay": args.delay = parseInt(next(), 10); break;
      case "--retries": args.retries = parseInt(next(), 10); break;
      case "--timeout": args.timeout = parseInt(next(), 10); break;
      case "--max-topics": args.maxTopics = parseInt(next(), 10); break;
      case "--categories": args.categories = next(); break;
      case "--concurrency": args.concurrency = Math.max(1, parseInt(next(), 10) || 1); break;
      case "--media": args.media = true; break;
      case "--force": args.force = true; break;
      case "-h":
      case "--help": args.help = true; break;
      default:
        console.error(`Unknown argument: ${a}`);
        args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`mitmachim.top forum scraper

Usage: node scrape.js [options]

Options:
  --out <dir>          Output directory (default: ./data)
  --delay <ms>         Delay between requests, rate limiting (default: 500)
  --retries <n>        Retry attempts per request (default: 4)
  --timeout <ms>       Per-request timeout (default: 45000)
  --max-topics <n>     Stop after N topics (0 = all, default: 0)
  --categories <ids>   Comma-separated category ids to scrape (default: all)
  --concurrency <n>    Number of topics fetched in parallel (default: 1)
  --media              Download referenced media (images/files) to media/
  --force              Re-scrape topics even if already saved
  -h, --help           Show this help
`);
}

// ----------------------------------------------------------------------------
// Small helpers
// ----------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...parts) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}]`, ...parts);
}

function hash(s) {
  return crypto.createHash("md5").update(String(s)).digest("hex").slice(0, 16);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// ----------------------------------------------------------------------------
// HTTP with retry + rate limiting
// ----------------------------------------------------------------------------

if (typeof fetch !== "function") {
  console.error("This script requires Node.js >= 18 (global fetch is missing).");
  process.exit(1);
}

let lastRequestAt = 0;
async function rateLimit(delay) {
  const wait = lastRequestAt + delay - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

/**
 * Fetch a URL with retries and rate limiting.
 * @param {string} url
 * @param {object} opts { as: "json"|"buffer", delay, retries, timeout }
 */
async function fetchWithRetry(url, opts) {
  const { as = "json", delay, retries, timeout } = opts;
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    await rateLimit(delay);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
          "Accept": as === "json" ? "application/json" : "*/*",
          "X-Requested-With": "XMLHttpRequest",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        // 4xx (other than 429) are not worth retrying.
        if (res.status >= 400 && res.status < 500) err.fatal = true;
        throw err;
      }

      if (as === "buffer") {
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
      }
      const text = await res.text();
      // NetFree filter detection (same idea as updates-monitor/scraper.js).
      if (text.includes("netfree.link") && text.length < 3000) {
        const err = new Error(
          "Network is filtered (NetFree) - the site is blocked. " +
            "Run from an open network or a cloud environment."
        );
        err.code = "NETWORK_BLOCKED";
        err.fatal = true;
        throw err;
      }
      try {
        return JSON.parse(text);
      } catch {
        const err = new Error(`Invalid JSON from ${url}`);
        throw err;
      }
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err.code === "NETWORK_BLOCKED") throw err; // no point retrying
      if (err.fatal) throw err;
      const backoff = Math.min(delay * Math.pow(2, attempt - 1), 15000);
      log(`  ! request failed (${attempt}/${retries}): ${err.message} -> retry in ${backoff}ms`);
      if (attempt < retries) await sleep(backoff);
    }
  }
  throw lastErr;
}

// ----------------------------------------------------------------------------
// Forum traversal
// ----------------------------------------------------------------------------

/** Flatten the category tree into a de-duplicated list of category descriptors. */
function flattenCategories(categories, acc = [], depth = 0, parentPath = []) {
  for (const c of categories || []) {
    const namePath = [...parentPath, c.name].filter(Boolean);
    acc.push({
      cid: c.cid,
      name: c.name,
      slug: c.slug,
      topic_count: c.topic_count,
      parentCid: c.parentCid,
      depth,
      path: namePath,
    });
    if (Array.isArray(c.children) && c.children.length) {
      flattenCategories(c.children, acc, depth + 1, namePath);
    }
  }
  return acc;
}

async function getCategories(opts) {
  log("Fetching category list ...");
  const data = await fetchWithRetry(`${BASE_URL}/api/categories`, opts);
  const tree = data.categories || [];
  const flat = flattenCategories(tree);
  // De-duplicate by cid (a category can appear both as a top-level section and child).
  const byCid = new Map();
  for (const c of flat) if (!byCid.has(c.cid)) byCid.set(c.cid, c);
  return { tree, flat: [...byCid.values()] };
}

/** Page through all topics of a category. Returns an array of topic summaries. */
async function getCategoryTopics(cid, opts, stopAfter = 0) {
  const topics = [];
  let page = 1;
  let pageCount = 1;
  do {
    const url = `${BASE_URL}/api/category/${cid}?page=${page}`;
    const data = await fetchWithRetry(url, opts);
    const pageTopics = data.topics || [];
    for (const t of pageTopics) {
      topics.push({
        tid: t.tid,
        title: t.titleRaw || t.title,
        slug: t.slug,
        cid: t.cid,
        uid: t.uid,
        author: t.user && (t.user.username || t.user.displayname),
        postcount: t.postcount,
        viewcount: t.viewcount,
        timestamp: t.timestamp,
        timestampISO: t.timestampISO,
        lastposttime: t.lastposttime,
        lastposttimeISO: t.lastposttimeISO,
        deleted: t.deleted,
        locked: t.locked,
        pinned: t.pinned,
        tags: (t.tags || []).map((tag) => tag.value || tag),
      });
    }
    pageCount = (data.pagination && data.pagination.pageCount) || 1;
    if (pageTopics.length === 0) break;
    log(`  category ${cid}: page ${page}/${pageCount} (+${pageTopics.length} topics, total ${topics.length})`);
    if (stopAfter && topics.length >= stopAfter) break;
    page++;
  } while (page <= pageCount);
  return topics;
}

/** Page through all posts of a topic. Returns a normalized topic object. */
async function getTopic(tid, opts) {
  const allPosts = [];
  let page = 1;
  let pageCount = 1;
  let meta = null;
  do {
    const url = `${BASE_URL}/api/topic/${tid}?page=${page}`;
    const data = await fetchWithRetry(url, opts);
    if (!meta) {
      meta = {
        tid: data.tid,
        title: data.title,
        titleRaw: data.titleRaw,
        slug: data.slug,
        cid: data.cid,
        category: data.category && { cid: data.category.cid, name: data.category.name, slug: data.category.slug },
        uid: data.uid,
        postcount: data.postcount,
        viewcount: data.viewcount,
        timestamp: data.timestamp,
        timestampISO: data.timestampISO,
        deleted: data.deleted,
        locked: data.locked,
        pinned: data.pinned,
        tags: (data.tags || []).map((tag) => tag.value || tag),
      };
    }
    const posts = data.posts || [];
    for (const p of posts) allPosts.push(normalizePost(p));
    pageCount = (data.pagination && data.pagination.pageCount) || 1;
    if (posts.length === 0) break;
    page++;
  } while (page <= pageCount);

  return { ...meta, scrapedAt: new Date().toISOString(), posts: allPosts };
}

function normalizePost(p) {
  return {
    pid: p.pid,
    tid: p.tid,
    index: p.index,
    uid: p.uid,
    author: p.user && {
      uid: p.user.uid,
      username: p.user.username,
      userslug: p.user.userslug,
      displayname: p.user.displayname,
    },
    content: p.content,
    timestamp: p.timestamp,
    timestampISO: p.timestampISO,
    edited: p.edited,
    editedISO: p.editedISO,
    deleted: p.deleted,
    upvotes: p.upvotes,
    downvotes: p.downvotes,
    votes: p.votes,
    replies: p.replies && (typeof p.replies.count === "number" ? p.replies.count : undefined),
    uploads: p.uploads || [],
    attachments: p.attachments || [],
  };
}

// ----------------------------------------------------------------------------
// Media download (optional)
// ----------------------------------------------------------------------------

function extractMediaUrls(topic) {
  const urls = new Set();
  for (const post of topic.posts || []) {
    // Explicit forum uploads.
    for (const u of post.uploads || []) {
      const url = typeof u === "string" ? u : u.url || u.name;
      if (url) urls.add(url);
    }
    for (const a of post.attachments || []) {
      const url = typeof a === "string" ? a : a.url;
      if (url) urls.add(url);
    }
    // Images / links embedded in the rendered HTML content.
    const html = post.content || "";
    const re = /(?:src|href)=["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const raw = m[1];
      if (!raw || raw.startsWith("data:")) continue;
      // Skip emoji sprite assets - they are not real forum media.
      if (raw.includes("nodebb-plugin-emoji")) continue;
      if (/\/assets\/uploads\//.test(raw) || /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|pdf|zip|rar|docx?|xlsx?|pptx?)(\?|$)/i.test(raw)) {
        urls.add(raw);
      }
    }
  }
  return [...urls];
}

function absoluteUrl(u) {
  try {
    return new URL(u, BASE_URL).toString();
  } catch {
    return null;
  }
}

async function downloadMedia(topic, mediaDir, opts) {
  const urls = extractMediaUrls(topic);
  let downloaded = 0;
  for (const raw of urls) {
    const url = absoluteUrl(raw);
    if (!url || !url.startsWith("http")) continue;
    // Only mirror media hosted on the forum itself.
    if (!url.includes("mitmachim.top")) continue;
    const extMatch = url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
    const ext = extMatch ? extMatch[1] : "bin";
    const file = path.join(mediaDir, `${hash(url)}.${ext}`);
    if (fs.existsSync(file)) continue;
    try {
      const buf = await fetchWithRetry(url, { ...opts, as: "buffer" });
      if (buf && buf.length > 64) {
        ensureDir(mediaDir);
        fs.writeFileSync(file, buf);
        downloaded++;
      }
    } catch (e) {
      log(`  ! media download failed: ${url.slice(0, 90)} (${e.message})`);
    }
  }
  return downloaded;
}

// ----------------------------------------------------------------------------
// Main orchestration
// ----------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const httpOpts = { delay: args.delay, retries: args.retries, timeout: args.timeout };
  const outDir = args.out;
  const topicsDir = path.join(outDir, "topics");
  const categoriesDir = path.join(outDir, "categories");
  const mediaDir = path.join(outDir, "media");
  const progressFile = path.join(outDir, "progress.json");
  ensureDir(outDir);
  ensureDir(topicsDir);
  ensureDir(categoriesDir);

  const progress = readJson(progressFile, { completedTids: [], startedAt: new Date().toISOString() });
  const done = new Set(progress.completedTids);
  const saveProgress = () => {
    progress.completedTids = [...done];
    progress.updatedAt = new Date().toISOString();
    writeJson(progressFile, progress);
  };

  // 1. Categories
  const { tree, flat } = await getCategories(httpOpts);
  writeJson(path.join(outDir, "categories.json"), { scrapedAt: new Date().toISOString(), tree, flat });
  log(`Found ${flat.length} categories.`);

  let cids = flat.map((c) => c.cid);
  if (args.categories) {
    const wanted = new Set(args.categories.split(",").map((s) => parseInt(s.trim(), 10)));
    cids = cids.filter((cid) => wanted.has(cid));
  }

  // 2. Build the topic list per category.
  const allTopics = [];
  for (const cid of cids) {
    const cat = flat.find((c) => c.cid === cid);
    log(`Listing topics for category ${cid} (${cat ? cat.name : "?"}) ...`);
    let topics = [];
    try {
      topics = await getCategoryTopics(cid, httpOpts, args.maxTopics);
    } catch (e) {
      if (e.code === "NETWORK_BLOCKED") throw e;
      log(`  ! failed to list category ${cid}: ${e.message}`);
      continue;
    }
    writeJson(path.join(categoriesDir, `${cid}.json`), {
      cid,
      name: cat ? cat.name : undefined,
      scrapedAt: new Date().toISOString(),
      topicCount: topics.length,
      topics,
    });
    for (const t of topics) allTopics.push(t);
    log(`  category ${cid}: ${topics.length} topics listed.`);
  }

  // De-duplicate topics by tid.
  const uniqueTopics = [...new Map(allTopics.map((t) => [t.tid, t])).values()];
  log(`Total unique topics to fetch: ${uniqueTopics.length}`);

  // 3. Fetch each topic (all posts), with resume support.
  let processed = 0;
  let mediaTotal = 0;
  const pending = uniqueTopics.filter((t) => args.force || !done.has(t.tid));
  log(`${pending.length} topics pending (${done.size} already done).`);

  const queue = [...pending];
  const worker = async () => {
    while (queue.length) {
      if (args.maxTopics && processed >= args.maxTopics) break;
      const t = queue.shift();
      if (!t) break;
      try {
        const topic = await getTopic(t.tid, httpOpts);
        writeJson(path.join(topicsDir, `${t.tid}.json`), topic);
        if (args.media) {
          const n = await downloadMedia(topic, mediaDir, httpOpts);
          mediaTotal += n;
        }
        done.add(t.tid);
        processed++;
        if (processed % 10 === 0) saveProgress();
        log(`  [${processed}/${pending.length}] topic ${t.tid} "${(t.title || "").slice(0, 50)}" (${topic.posts.length} posts)`);
      } catch (e) {
        if (e.code === "NETWORK_BLOCKED") throw e;
        log(`  ! failed topic ${t.tid}: ${e.message}`);
      }
    }
  };

  const workers = Array.from({ length: args.concurrency }, () => worker());
  await Promise.all(workers);

  saveProgress();
  log(`Done. Topics saved: ${processed}. Media files: ${mediaTotal}.`);
  log(`Data written to: ${outDir}`);
}

main().catch((err) => {
  if (err && err.code === "NETWORK_BLOCKED") {
    console.error(`\nNETWORK BLOCKED: ${err.message}`);
    process.exit(2);
  }
  console.error("\nFatal error:", err && err.stack ? err.stack : err);
  process.exit(1);
});
