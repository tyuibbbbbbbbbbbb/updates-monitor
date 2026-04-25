const $ = (s) => document.querySelector(s);
const feedEl = $("#feed");
const filtersEl = $("#filters");
const statusEl = $("#status");
const refreshBtn = $("#refreshBtn");
const errorsEl = $("#errors");
const emptyEl = $("#empty");
const lastCheckEl = $("#lastCheck");
const pollMinEl = $("#pollMin");

let activeFilter = "all";
let lastData = null;

function relTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "כרגע";
  if (m < 60) return `לפני ${m} דק'`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} שע'`;
  const d = Math.floor(h / 24);
  return `לפני ${d} ימים`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function render(data) {
  lastData = data;
  pollMinEl.textContent = data.pollMinutes;
  lastCheckEl.textContent = relTime(data.lastCheck);

  // status
  if (data.lastError && data.lastError.length) {
    statusEl.textContent = `שגיאה ב-${data.lastError.length} מקורות`;
    statusEl.className = "status err";
    errorsEl.classList.remove("hidden");
    errorsEl.innerHTML = data.lastError.map(e =>
      `<div>⚠️ <b>${escapeHtml(e.source)}</b>: ${escapeHtml(e.error)}</div>`
    ).join("");
  } else if (data.lastCheck) {
    statusEl.textContent = "פעיל";
    statusEl.className = "status ok";
    errorsEl.classList.add("hidden");
  }

  // filters
  const counts = { all: data.items.length };
  for (const it of data.items) {
    counts[it.sourceId] = (counts[it.sourceId] || 0) + 1;
  }
  const newCount = data.items.filter(i => i.isNew).length;

  const chips = [
    `<button class="filter-chip ${activeFilter === 'all' ? 'active' : ''}" data-f="all">
      הכל <span class="count">${counts.all}</span>
    </button>`,
    `<button class="filter-chip ${activeFilter === 'new' ? 'active' : ''}" data-f="new">
      🆕 חדשים <span class="count">${newCount}</span>
    </button>`,
    ...data.sources.map(s => `
      <button class="filter-chip ${activeFilter === s.id ? 'active' : ''}" data-f="${s.id}">
        ${s.icon} ${escapeHtml(s.name)} <span class="count">${counts[s.id] || 0}</span>
      </button>
    `),
  ];
  filtersEl.innerHTML = chips.join("");
  filtersEl.querySelectorAll(".filter-chip").forEach(b => {
    b.addEventListener("click", () => {
      activeFilter = b.dataset.f;
      render(lastData);
    });
  });

  // feed
  let items = data.items;
  if (activeFilter === "new") items = items.filter(i => i.isNew);
  else if (activeFilter !== "all") items = items.filter(i => i.sourceId === activeFilter);

  if (items.length === 0) {
    feedEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  feedEl.innerHTML = items.map(it => `
    <article class="card ${it.isNew ? 'new' : ''}">
      <div class="card-source" style="background: ${it.sourceColor}33; border: 1px solid ${it.sourceColor}66;">
        ${it.sourceIcon}
      </div>
      <div class="card-body">
        <div class="card-title">
          <a href="${escapeHtml(it.link)}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a>
          ${it.isNew ? '<span class="new-badge">חדש</span>' : ''}
        </div>
        <div class="card-meta">
          <span class="source-name">${it.sourceIcon} ${escapeHtml(it.sourceName)}</span>
          <span>•</span>
          <span>${relTime(it.firstSeen)}</span>
        </div>
        ${it.body ? `<div class="card-body-text">${escapeHtml(it.body)}</div>` : ''}
      </div>
    </article>
  `).join("");
}

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

refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "סורק...";
  refreshBtn.classList.add("loading");
  try {
    await fetch("/api/refresh", { method: "POST" });
    await load();
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "🔄 רענן עכשיו";
    refreshBtn.classList.remove("loading");
  }
});

load();
setInterval(load, 30000); // ריענון UI כל 30 שנ'
