const $ = (s) => document.querySelector(s);
const feedEl = $("#feed");
const filtersEl = $("#filters");
const statusEl = $("#status");
const errorsEl = $("#errors");
const emptyEl = $("#empty");

let activeFilter = "all";
let lastData = null;
let knownIds = new Set();

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  return timeStr;
}

function renderMessage(it, isNewMsg) {
  const imagesHtml = (it.images && it.images.length > 0)
    ? `<div class="msg-images">${it.images.map(src =>
        `<img src="${escapeHtml(src)}" alt="תמונה" loading="lazy" onclick="openImage(this.src)">`
      ).join("")}</div>`
    : "";

  return `
    <div class="msg ${isNewMsg ? 'new-msg' : ''}" data-id="${it.id}">
      <div class="msg-avatar">${it.sourceIcon || "📨"}</div>
      <div class="msg-bubble">
        <div class="msg-source">${escapeHtml(it.sourceName)}</div>
        ${it.channelName ? `<div class="msg-channel">${escapeHtml(it.channelName)}</div>` : ""}
        ${it.body ? `<div class="msg-text">${escapeHtml(it.body)}</div>` : ""}
        ${imagesHtml}
        <div class="msg-footer">
          ${it.isNew ? '<span class="msg-new-badge">חדש</span>' : ''}
          <span class="msg-time">${formatTime(it.time) || escapeHtml(relTime(it.firstSeen))}</span>
        </div>
      </div>
    </div>
  `;
}

function relTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "כרגע";
  if (m < 60) return `לפני ${m} דק'`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} שע'`;
  const d = Math.floor(h / 24);
  return `לפני ${d} ימים`;
}

function render(data) {
  lastData = data;

  // status
  const errs = [];
  if (data.fetchError) errs.push({ source: "שרת מקומי", error: data.fetchError });
  if (data.upstreamErrors && data.upstreamErrors.length) errs.push(...data.upstreamErrors);

  if (errs.length) {
    statusEl.textContent = `⚠️ ${errs.length} שגיאות`;
    statusEl.className = "status err";
    errorsEl.classList.remove("hidden");
    errorsEl.innerHTML = errs.map(e =>
      `<div>⚠️ <b>${escapeHtml(e.source)}</b>: ${escapeHtml(e.error)}</div>`
    ).join("");
  } else if (data.lastCheck) {
    statusEl.textContent = `🟢 ${data.items.length} הודעות`;
    statusEl.className = "status ok";
    errorsEl.classList.add("hidden");
  } else {
    statusEl.textContent = "ממתין...";
    statusEl.className = "status";
    errorsEl.classList.add("hidden");
  }

  // filters
  const counts = { all: data.items.length };
  for (const it of data.items) counts[it.sourceId] = (counts[it.sourceId] || 0) + 1;
  const newCount = data.items.filter(i => i.isNew).length;

  const chips = [
    `<button class="filter-chip ${activeFilter === 'all' ? 'active' : ''}" data-f="all">
      הכל <span class="count">${counts.all}</span></button>`,
    ...(newCount > 0 ? [`<button class="filter-chip ${activeFilter === 'new' ? 'active' : ''}" data-f="new">
      🆕 <span class="count">${newCount}</span></button>`] : []),
    ...data.sources.map(s => `
      <button class="filter-chip ${activeFilter === s.id ? 'active' : ''}" data-f="${s.id}">
        ${s.icon} <span class="count">${counts[s.id] || 0}</span></button>`),
  ];
  filtersEl.innerHTML = chips.join("");
  filtersEl.querySelectorAll(".filter-chip").forEach(b => {
    b.addEventListener("click", () => { activeFilter = b.dataset.f; render(lastData); });
  });

  // messages
  let items = data.items;
  if (activeFilter === "new") items = items.filter(i => i.isNew);
  else if (activeFilter !== "all") items = items.filter(i => i.sourceId === activeFilter);

  if (items.length === 0) {
    feedEl.innerHTML = `<div class="empty">אין הודעות להצגה</div>`;
    return;
  }

  const wasAtBottom = feedEl.scrollTop + feedEl.clientHeight >= feedEl.scrollHeight - 50;

  feedEl.innerHTML = items.map(it => {
    const isNewMsg = !knownIds.has(it.id);
    return renderMessage(it, isNewMsg);
  }).join("");

  // update known IDs
  items.forEach(it => knownIds.add(it.id));

  // scroll to bottom if was at bottom
  if (wasAtBottom) {
    feedEl.scrollTop = feedEl.scrollHeight;
  }
}

// פתיחת תמונה בגודל מלא
window.openImage = function(src) {
  const overlay = document.createElement("div");
  overlay.className = "img-overlay";
  overlay.innerHTML = `<img src="${escapeHtml(src)}">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
};

async function load() {
  try {
    const res = await fetch("/api/updates");
    const data = await res.json();
    render(data);
  } catch (e) {
    statusEl.textContent = "שגיאת חיבור";
    statusEl.className = "status err";
  }
}

load();
setInterval(load, 6000); // רענון UI כל 6 שניות
