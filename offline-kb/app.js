/* ═══════════════════════════════════════════
   離線知識庫 — app.js
   ═══════════════════════════════════════════ */

'use strict';

// ─── DOM refs ────────────────────────────────
const $  = id => document.getElementById(id);
const $search         = $('search');
const $clearBtn       = $('clearBtn');
const $cardList       = $('cardList');
const $tagCloud       = $('tagCloud');
const $emptyState     = $('emptyState');
const $countBadge     = $('countBadge');
const $preview        = $('preview');
const $welcomeScreen  = $('welcomeScreen');
const $viewerToolbar  = $('viewerToolbar');
const $viewerTitle    = $('viewerTitle');
const $viewerTag      = $('viewerTag');
const $welcomeStats   = $('welcomeStats');
const $starBtn        = $('starBtn');
const $newTabBtn      = $('newTabBtn');
const $closeBtn       = $('closeBtn');
const $refreshBtn     = $('refreshBtn');
const $toast          = $('toast');
const $sidebar        = document.querySelector('.sidebar');
const $sidebarToggle  = $('sidebarToggle');

// ─── State ───────────────────────────────────
let starred     = new Set(JSON.parse(localStorage.getItem('kb_starred') || '[]'));
let recentPaths = JSON.parse(localStorage.getItem('kb_recent') || '[]');
let activeFilter = 'all';
let activeTag    = '';
let activeCard   = null;
let toastTimer   = null;

// ─── Boot ────────────────────────────────────
// database 來自 database.js（由 generate.js 自動產生）
loadDatabase();

function loadDatabase() {
  if (typeof database === 'undefined' || !Array.isArray(database)) {
    $countBadge.textContent = '載入失敗';
    toast('❌ 找不到 database.js，請先執行 node generate.js', 4000);
    return;
  }
  buildTagCloud();
  applyFilters();
  renderStats();
  toast('✅ 已載入 ' + database.length + ' 篇文章');
}

// ─── Tag cloud ───────────────────────────────
function buildTagCloud() {
  const counts = {};
  database.forEach(d => (d.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));

  $tagCloud.innerHTML = '';
  $tagCloud.appendChild(makeChip('全部', '', true));

  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tag, n]) => $tagCloud.appendChild(makeChip(`${tag} (${n})`, tag, false)));
}

function makeChip(label, tag, isActive) {
  const el = document.createElement('span');
  el.className = 'tag-chip' + (isActive ? ' active' : '');
  el.textContent = label;
  el.dataset.tag = tag;
  el.onclick = () => {
    activeTag = tag;
    document.querySelectorAll('.tag-chip').forEach(c => c.classList.toggle('active', c.dataset.tag === tag));
    applyFilters();
  };
  return el;
}

// ─── Filter buttons ──────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.onclick = () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
  };
});

// ─── Search ──────────────────────────────────
$search.oninput = () => {
  $clearBtn.classList.toggle('visible', $search.value.length > 0);
  applyFilters();
};

$clearBtn.onclick = () => {
  $search.value = '';
  $clearBtn.classList.remove('visible');
  applyFilters();
  $search.focus();
};

// ─── Apply filters + search ──────────────────
function applyFilters() {
  const kw = $search.value.trim().toLowerCase();
  let pool = database.slice();

  if (activeFilter === 'starred') {
    pool = pool.filter(d => starred.has(d.path));
  } else if (activeFilter === 'recent') {
    const set = new Set(recentPaths);
    pool = pool.filter(d => set.has(d.path));
    pool.sort((a, b) => recentPaths.indexOf(a.path) - recentPaths.indexOf(b.path));
  }

  if (activeTag) pool = pool.filter(d => (d.tags || []).includes(activeTag));

  if (kw) {
    pool = pool.filter(d =>
      (d.title || '').toLowerCase().includes(kw) ||
      (d.desc  || '').toLowerCase().includes(kw) ||
      (d.tags  || []).some(t => t.toLowerCase().includes(kw)) ||
      (d.path  || '').toLowerCase().includes(kw)
    );
  }

  renderCards(pool, kw);
  $countBadge.textContent = pool.length + ' 篇';
}

// ─── Render cards ────────────────────────────
function renderCards(list, highlight) {
  $cardList.innerHTML = '';
  $emptyState.style.display = list.length === 0 ? 'flex' : 'none';

  list.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card' + (item.path === activeCard ? ' active' : '');

    const displayPath = item.path.replace(/^database\//, '');
    const titleHTML = highlight ? escHi(item.title || displayPath, highlight) : esc(item.title || displayPath);
    const descHTML  = highlight && item.desc ? escHi(item.desc, highlight) : esc(item.desc || '');
    const tagsHTML  = (item.tags || []).map(t => `<span class="card-tag">${esc(t)}</span>`).join('');
    const isStarred = starred.has(item.path);

    card.innerHTML = `
      <span class="card-star${isStarred ? ' on' : ''}" title="收藏">☆</span>
      <div class="card-title">${titleHTML}</div>
      <div class="card-meta">${tagsHTML}</div>
      ${item.desc ? `<div class="card-desc">${descHTML}</div>` : ''}
    `;

    card.querySelector('.card-star').onclick = e => {
      e.stopPropagation();
      toggleStar(item.path, card.querySelector('.card-star'));
    };

    card.onclick = () => openArticle(item, card);
    $cardList.appendChild(card);
  });
}

// ─── Open article ────────────────────────────
function openArticle(item, cardEl) {
  activeCard = item.path;

  document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
  cardEl && cardEl.classList.add('active');

  $welcomeScreen.style.display  = 'none';
  $viewerToolbar.style.display  = 'flex';
  $preview.style.display        = 'block';
  $sidebar.classList.add('collapsed');

  $viewerTitle.textContent = item.title || item.path;
  $viewerTag.textContent   = (item.tags || []).join(' · ');
  $viewerTag.style.display = item.tags && item.tags.length ? 'inline' : 'none';
  $starBtn.className       = 'icon-btn' + (starred.has(item.path) ? ' starred' : '');
  $starBtn.title           = starred.has(item.path) ? '取消收藏' : '收藏';

  // 用 iframe src 直接載入（純離線，不需 server）
  $preview.removeAttribute('srcdoc');
  $preview.src = item.path;

  pushRecent(item.path);
}

// ─── Star ────────────────────────────────────
function toggleStar(path, chipEl) {
  if (starred.has(path)) {
    starred.delete(path);
    if (chipEl) chipEl.className = 'card-star';
    if (activeCard === path) $starBtn.className = 'icon-btn';
    toast('已取消收藏');
  } else {
    starred.add(path);
    if (chipEl) chipEl.className = 'card-star on';
    if (activeCard === path) $starBtn.className = 'icon-btn starred';
    toast('⭐ 已加入收藏');
  }
  localStorage.setItem('kb_starred', JSON.stringify([...starred]));
}

$starBtn.onclick = () => {
  if (!activeCard) return;
  const chipEl = document.querySelector('.card.active .card-star');
  toggleStar(activeCard, chipEl);
};

// ─── Recent ──────────────────────────────────
function pushRecent(path) {
  recentPaths = recentPaths.filter(p => p !== path);
  recentPaths.unshift(path);
  recentPaths = recentPaths.slice(0, 50);
  localStorage.setItem('kb_recent', JSON.stringify(recentPaths));
}

// ─── Toolbar buttons ─────────────────────────
$newTabBtn.onclick = () => { if (activeCard) window.open(activeCard, '_blank'); };

$closeBtn.onclick = () => {
  activeCard = null;
  $preview.src = 'about:blank';
  $preview.removeAttribute('srcdoc');
  $preview.style.display        = 'none';
  $viewerToolbar.style.display  = 'none';
  $welcomeScreen.style.display  = 'flex';
  $sidebar.classList.remove('collapsed');
  document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
};

$sidebarToggle.onclick = () => $sidebar.classList.toggle('collapsed');

$refreshBtn.onclick = () => {
  toast('⚠️ 靜態模式：請重新執行 node generate.js 再重新整理頁面', 3000);
};

// ─── Stats ───────────────────────────────────
function renderStats() {
  const tags = new Set(database.flatMap(d => d.tags || []));
  $welcomeStats.innerHTML = `
    <div class="stat-item"><div class="stat-num">${database.length}</div><div class="stat-lbl">篇文章</div></div>
    <div class="stat-item"><div class="stat-num">${tags.size}</div><div class="stat-lbl">個標籤</div></div>
    <div class="stat-item"><div class="stat-num">${starred.size}</div><div class="stat-lbl">已收藏</div></div>
  `;
}

// ─── Toast ───────────────────────────────────
function toast(msg, duration = 2000) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), duration);
}

// ─── Helpers ─────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escHi(str, kw) {
  const e = esc(str);
  const k = esc(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return e.replace(new RegExp(`(${k})`, 'gi'), '<mark>$1</mark>');
}

// ─── Keyboard shortcuts ──────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); $search.focus(); $search.select(); }
  if (e.key === 'Escape') {
    if ($search.value) { $search.value = ''; $clearBtn.classList.remove('visible'); applyFilters(); }
    else if (activeCard) $closeBtn.click();
  }
});
