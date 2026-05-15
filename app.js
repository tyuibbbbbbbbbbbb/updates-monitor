// קישור ישיר ל-JSON שנוצר ע"י GitHub Actions
const DATA_URL = "https://raw.githubusercontent.com/tyuibbbbbbbbbbbb/updates-monitor/main/data/updates.json";
const POLL_INTERVAL = 6000; // בדיקה כל 6 שניות

const feedEl = document.getElementById("feed");
const filtersEl = document.getElementById("filters");
const statusEl = document.getElementById("status");
const errorsEl = document.getElementById("errors");

let activeFilter = "all";
let knownIds = new Set();
let allItems = [];
let sources = [];
let lastGeneratedAt = null;

// זכירת מיקום קריאה
const LAST_READ_KEY = "updates-monitor-last-read";
let lastReadId = localStorage.getItem(LAST_READ_KEY) || null;

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function relTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "כרגע";
  if (m < 60) return `לפני ${m} דק'`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} שע'`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

function createMsgEl(it, animate) {
  const div = document.createElement("div");
  div.className = "msg" + (animate ? " new-msg" : "");
  div.dataset.id = it.id;
  div.dataset.source = it.sourceId;

  // תמונות נטענות כ-blob (עקיפת נטפרי)
  const imagesHtml = (it.images && it.images.length > 0)
    ? `<div class="msg-images">${it.images.map((src, i) =>
        `<img data-blob-src="${escapeHtml(src)}" alt="" loading="lazy" style="opacity:0;transition:opacity .3s" onclick="openImage(this.src)">`
      ).join("")}</div>`
    : "";

  // סרטוני .bin (מהריפו) או YouTube
  let videosHtml = "";
  if (it.youtubeId) {
    videosHtml = `<div class="msg-video"><div class="vid-container yt-container" data-ytid="${escapeHtml(it.youtubeId)}">
      <div style="padding:20px;text-align:center;color:#fff;font-size:0.8rem;cursor:pointer" onclick="loadYT(this.parentElement)">▶ לחץ להפעלה</div></div></div>`;
  } else if (it.videos && it.videos.length > 0) {
    videosHtml = `<div class="msg-video">${it.videos.map(url =>
      `<div class="vid-container" data-src="${escapeHtml(url)}"><div style="padding:20px;text-align:center;color:#fff;font-size:0.8rem;">▶ טוען סרטון...</div></div>`
    ).join("")}</div>`;
  }

  div.innerHTML = `
    <div class="msg-avatar">${it.sourceIcon || "📨"}</div>
    <div class="msg-bubble">
      <div class="msg-source">${escapeHtml(it.sourceName)}</div>
      ${it.channelName ? `<div class="msg-channel">${escapeHtml(it.channelName)}</div>` : ""}
      ${it.body ? `<div class="msg-text">${escapeHtml(it.body)}</div>` : ""}
      ${imagesHtml}
      ${videosHtml}
      <div class="msg-footer">
        ${it.isNew ? '<span class="msg-new-badge">חדש</span>' : ""}
        <span class="msg-time">${it.time || relTime(it.firstSeen)}</span>
      </div>
    </div>
  `;

  // טעינת סרטונים כ-blob (עוקף נטפרי)
  div.querySelectorAll(".vid-container[data-src]").forEach(container => {
    loadVideoBlob(container, container.dataset.src);
  });

  // טעינת תמונות כ-blob (עוקף נטפרי)
  div.querySelectorAll("img[data-blob-src]").forEach(img => {
    loadImageBlob(img, img.dataset.blobSrc);
  });

  return div;
}

// טוען תמונה כ-blob URL כדי שנטפרי לא יזהה אותה
async function loadImageBlob(img, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    img.src = URL.createObjectURL(blob);
    img.style.opacity = "1";
  } catch (e) {
    img.alt = "⚠";
    img.style.opacity = "0.3";
  }
}

// טוען סרטון כ-blob URL כדי שנטפרי לא יזהה אותו
async function loadVideoBlob(container, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.src = blobUrl;
    video.controls = true;
    video.preload = "metadata";
    video.style.width = "100%";
    video.style.borderRadius = "8px";
    container.innerHTML = "";
    container.appendChild(video);
  } catch (e) {
    container.innerHTML = `<div style="padding:10px;color:#999;font-size:0.75rem;">⚠ שגיאה בטעינת סרטון</div>`;
  }
}

// הטמעת סרטון YouTube דרך youtube-nocookie.com (פחות נחסם בנטפרי)
function loadYT(container) {
  const ytid = container.dataset.ytid;
  if (!ytid) return;
  container.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${ytid}" 
    style="width:100%;height:180px;border:none;border-radius:8px;" 
    allow="accelerometer;autoplay;encrypted-media;gyroscope;picture-in-picture" 
    allowfullscreen></iframe>`;
}

function shouldShow(item) {
  if (activeFilter === "all") return true;
  if (activeFilter === "new") return item.isNew;
  return item.sourceId === activeFilter;
}

function renderFilters() {
  const counts = { all: allItems.length };
  for (const it of allItems) counts[it.sourceId] = (counts[it.sourceId] || 0) + 1;
  const newCount = allItems.filter(i => i.isNew).length;

  const chips = [
    `<button class="filter-chip ${activeFilter === 'all' ? 'active' : ''}" data-f="all">
      הכל <span class="count">${counts.all}</span></button>`,
    ...(newCount > 0 ? [`<button class="filter-chip ${activeFilter === 'new' ? 'active' : ''}" data-f="new">
      🆕 <span class="count">${newCount}</span></button>`] : []),
    ...sources.map(s => `
      <button class="filter-chip ${activeFilter === s.id ? 'active' : ''}" data-f="${s.id}">
        ${s.icon} ${s.name} <span class="count">${counts[s.id] || 0}</span></button>`),
  ];
  filtersEl.innerHTML = chips.join("");
  filtersEl.querySelectorAll(".filter-chip").forEach(b => {
    b.addEventListener("click", () => {
      activeFilter = b.dataset.f;
      rebuildFeed();
    });
  });
}

function rebuildFeed() {
  // מציג רק את ההודעות שמתאימות לפילטר הנוכחי
  feedEl.innerHTML = "";
  const visible = allItems.filter(shouldShow);
  if (visible.length === 0) {
    feedEl.innerHTML = `<div class="empty">אין הודעות להצגה</div>`;
    return;
  }
  let scrollTarget = null;
  for (const it of visible) {
    const el = createMsgEl(it, false);
    feedEl.appendChild(el);
    if (it.id === lastReadId) scrollTarget = el;
  }

  // גלילה למיקום הקריאה האחרון
  if (scrollTarget) {
    scrollTarget.classList.add("last-read-marker");
    setTimeout(() => scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  } else {
    feedEl.scrollTop = feedEl.scrollHeight;
  }
  renderFilters();
}

function addNewMessages(newItems) {
  const wasAtBottom = feedEl.scrollTop + feedEl.clientHeight >= feedEl.scrollHeight - 60;

  for (const it of newItems) {
    if (shouldShow(it)) {
      // מסיר הודעת "ריק" אם קיימת
      const emptyEl = feedEl.querySelector(".empty");
      if (emptyEl) emptyEl.remove();
      feedEl.appendChild(createMsgEl(it, true));
    }
  }

  renderFilters();

  // גלילה למטה אם היינו כבר למטה
  if (wasAtBottom) {
    feedEl.scrollTop = feedEl.scrollHeight;
  }
}

async function checkForUpdates() {
  try {
    const res = await fetch(DATA_URL + "?_t=" + Date.now());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // אם אין שינוי – לא עושים כלום
    if (data.generatedAt === lastGeneratedAt) return;
    lastGeneratedAt = data.generatedAt;
    sources = data.sources || [];

    // עדכון שגיאות
    if (data.errors && data.errors.length > 0) {
      errorsEl.classList.remove("hidden");
      errorsEl.innerHTML = data.errors.map(e =>
        `<div>⚠️ <b>${escapeHtml(e.source)}</b>: ${escapeHtml(e.error)}</div>`
      ).join("");
    } else {
      errorsEl.classList.add("hidden");
    }

    // סימון פריטים חדשים (פחות מ-24 שעות)
    const items = (data.items || []).map(it => ({
      ...it,
      isNew: it.firstSeen && (Date.now() - new Date(it.firstSeen).getTime() < 24 * 60 * 60 * 1000),
    }));

    // מציאת פריטים חדשים שלא ראינו
    const newItems = items.filter(it => !knownIds.has(it.id));

    if (knownIds.size === 0) {
      // טעינה ראשונה – מציגים הכל
      allItems = items;
      for (const it of items) knownIds.add(it.id);
      rebuildFeed();
    } else if (newItems.length > 0) {
      // הוספת הודעות חדשות למטה
      allItems.push(...newItems);
      for (const it of newItems) knownIds.add(it.id);
      addNewMessages(newItems);
    }

    statusEl.textContent = `🟢 ${allItems.length} הודעות`;
    statusEl.className = "status ok";
  } catch (e) {
    statusEl.textContent = "⚠️ שגיאה";
    statusEl.className = "status err";
    console.error("Fetch error:", e.message);
  }
}

// פתיחת תמונה בגודל מלא
window.openImage = function(src) {
  const overlay = document.createElement("div");
  overlay.className = "img-overlay";
  overlay.innerHTML = `<img src="${src}">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
};

// עדכון מיקום קריאה – שומר את ההודעה האחרונה הנראית
function updateReadPosition() {
  const msgs = feedEl.querySelectorAll(".msg");
  if (!msgs.length) return;
  const feedRect = feedEl.getBoundingClientRect();
  let lastVisible = null;
  for (const m of msgs) {
    const r = m.getBoundingClientRect();
    if (r.top < feedRect.bottom - 50) lastVisible = m;
  }
  if (lastVisible && lastVisible.dataset.id) {
    lastReadId = lastVisible.dataset.id;
    localStorage.setItem(LAST_READ_KEY, lastReadId);
  }
}
feedEl.addEventListener("scroll", () => {
  clearTimeout(feedEl._readTimer);
  feedEl._readTimer = setTimeout(updateReadPosition, 300);
});

// התחלה
checkForUpdates();
setInterval(checkForUpdates, POLL_INTERVAL);
