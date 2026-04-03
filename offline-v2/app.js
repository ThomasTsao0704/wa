/* ═══════════════════════════════════════════
   離線知識庫 — app.js  v2.0
   CRUD + WYSIWYG 編輯器 + 同步 + 權限
   ═══════════════════════════════════════════ */
'use strict';

// ─── DOM refs ────────────────────────────────
const $ = id => document.getElementById(id);
const $search        = $('search');
const $clearBtn      = $('clearBtn');
const $cardList      = $('cardList');
const $tagCloud      = $('tagCloud');
const $emptyState    = $('emptyState');
const $countBadge    = $('countBadge');
const $preview       = $('preview');
const $welcomeScreen = $('welcomeScreen');
const $viewerToolbar = $('viewerToolbar');
const $viewerTitle   = $('viewerTitle');
const $viewerTag     = $('viewerTag');
const $welcomeStats  = $('welcomeStats');
const $starBtn       = $('starBtn');
const $newTabBtn     = $('newTabBtn');
const $closeBtn      = $('closeBtn');
const $refreshBtn    = $('refreshBtn');
const $toast         = $('toast');
const $sidebar       = document.querySelector('.sidebar');
const $sidebarToggle = $('sidebarToggle');

// CRUD buttons
const $addBtn    = $('addBtn');
const $editBtn   = $('editBtn');
const $deleteBtn = $('deleteBtn');

// Editor modal
const $editorModal      = $('editorModal');
const $editorModalTitle = $('editorModalTitle');
const $edTitle          = $('edTitle');
const $edTags           = $('edTags');
const $edDesc           = $('edDesc');
const $editorArea       = $('editorArea');
const $sourceArea       = $('sourceArea');
const $editorSaveBtn    = $('editorSaveBtn');
const $editorCharCount  = $('editorCharCount');

// Delete modal
const $deleteModal      = $('deleteModal');
const $deleteTarget     = $('deleteTarget');
const $confirmDeleteBtn = $('confirmDeleteBtn');

// Sync modal
const $syncModal   = $('syncModal');
const $syncBtn     = $('syncBtn');
const $exportBtn   = $('exportBtn');
const $importBtn   = $('importBtn');
const $importFile  = $('importFile');
const $importDbBtn = $('importDbBtn');

// Permission modal
const $lockBtn        = $('lockBtn');
const $permModal      = $('permModal');
const $permTitle      = $('permTitle');
const $permSetView    = $('permSetView');
const $permUnlockView = $('permUnlockView');
const $permManageView = $('permManageView');
const $permPwdSet     = $('permPwdSet');
const $permPwdConfirm = $('permPwdConfirm');
const $permPwdUnlock  = $('permPwdUnlock');
const $permActionBtn  = $('permActionBtn');
const $permRemoveBtn  = $('permRemoveBtn');

// ─── State ───────────────────────────────────
let db          = [];          // 主資料庫
let articles    = {};          // { id: htmlContent }
let starred     = new Set(JSON.parse(localStorage.getItem('kb_starred') || '[]'));
let recentPaths = JSON.parse(localStorage.getItem('kb_recent') || '[]');
let activeFilter = 'all';
let activeTag    = '';
let activeCard   = null;       // 當前選中的 item.id
let editingId    = null;       // 編輯中的 id（null = 新增）
let sourceMode   = false;
let isLocked     = false;      // 編輯是否被鎖定
let toastTimer   = null;

// ─── Persistence keys ────────────────────────
const LS = {
  db:       'kb_db',
  articles: 'kb_articles',
  starred:  'kb_starred',
  recent:   'kb_recent',
  pwd:      'kb_pwd',
  unlocked: 'kb_unlocked',
};

// ─── Boot ────────────────────────────────────
boot();

function boot() {
  loadState();
  checkPermission();
  buildTagCloud();
  applyFilters();
  renderStats();
  updateEditVisibility();

  if (db.length > 0) {
    toast('✅ 已載入 ' + db.length + ' 篇文章');
  } else {
    toast('📝 知識庫為空，按右上角 ＋ 新增第一篇', 3000);
  }
}

function loadState() {
  // 從 localStorage 讀取
  const savedDb  = localStorage.getItem(LS.db);
  const savedArt = localStorage.getItem(LS.articles);

  if (savedDb) {
    db       = JSON.parse(savedDb);
    articles = savedArt ? JSON.parse(savedArt) : {};
  } else {
    // 首次啟動：從 database.js (全域 database) 匯入
    if (typeof database !== 'undefined' && Array.isArray(database)) {
      db = database.map(d => ({
        id:    genId(),
        title: d.title || '未命名',
        desc:  d.desc  || '',
        tags:  d.tags  || [],
        path:  d.path  || '',       // 保留原始路徑供 iframe 載入
        created: Date.now(),
        updated: Date.now(),
      }));
    }
    saveState();
  }
}

function saveState() {
  localStorage.setItem(LS.db, JSON.stringify(db));
  localStorage.setItem(LS.articles, JSON.stringify(articles));
}

// ─── Permission system ───────────────────────
function checkPermission() {
  const pwd = localStorage.getItem(LS.pwd);
  if (!pwd) {
    isLocked = false;
    $lockBtn.textContent = '🔓';
    $lockBtn.title = '權限設定';
  } else {
    // 有密碼 → 檢查是否已解鎖（sessionStorage，關分頁就重新鎖）
    isLocked = !sessionStorage.getItem(LS.unlocked);
    $lockBtn.textContent = isLocked ? '🔒' : '🔓';
    $lockBtn.title = isLocked ? '點擊解鎖' : '已解鎖';
  }
}

function updateEditVisibility() {
  document.querySelectorAll('.edit-action').forEach(el => {
    el.style.display = isLocked ? 'none' : '';
  });
}

// Simple hash (not crypto-grade, but fine for offline personal use)
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return 'h_' + Math.abs(h).toString(36);
}

$lockBtn.onclick = () => {
  const pwd = localStorage.getItem(LS.pwd);

  // 隱藏所有 views
  $permSetView.style.display    = 'none';
  $permUnlockView.style.display = 'none';
  $permManageView.style.display = 'none';
  $permRemoveBtn.style.display  = 'none';

  if (!pwd) {
    // 沒有密碼 → 顯示設定
    $permTitle.textContent = '設定密碼';
    $permSetView.style.display = '';
    $permActionBtn.textContent = '設定密碼';
    $permPwdSet.value = '';
    $permPwdConfirm.value = '';
  } else if (isLocked) {
    // 有密碼且鎖定 → 顯示解鎖
    $permTitle.textContent = '解鎖編輯';
    $permUnlockView.style.display = '';
    $permActionBtn.textContent = '解鎖';
    $permPwdUnlock.value = '';
  } else {
    // 已解鎖 → 顯示管理
    $permTitle.textContent = '權限管理';
    $permManageView.style.display = '';
    $permRemoveBtn.style.display  = '';
    $permActionBtn.textContent = '重新鎖定';
  }

  openModal('permModal');
};

$permActionBtn.onclick = () => {
  const pwd = localStorage.getItem(LS.pwd);

  if (!pwd) {
    // 設定密碼
    const p1 = $permPwdSet.value;
    const p2 = $permPwdConfirm.value;
    if (!p1) return toast('⚠️ 請輸入密碼');
    if (p1 !== p2) return toast('⚠️ 兩次密碼不一致');
    localStorage.setItem(LS.pwd, simpleHash(p1));
    sessionStorage.setItem(LS.unlocked, '1');
    isLocked = false;
    checkPermission();
    updateEditVisibility();
    closeModal('permModal');
    toast('🔐 密碼已設定，關閉瀏覽器後會自動鎖定');
  } else if (isLocked) {
    // 解鎖
    const p = $permPwdUnlock.value;
    if (simpleHash(p) !== pwd) return toast('❌ 密碼錯誤');
    sessionStorage.setItem(LS.unlocked, '1');
    isLocked = false;
    checkPermission();
    updateEditVisibility();
    closeModal('permModal');
    toast('🔓 已解鎖編輯功能');
  } else {
    // 重新鎖定
    sessionStorage.removeItem(LS.unlocked);
    isLocked = true;
    checkPermission();
    updateEditVisibility();
    closeModal('permModal');
    toast('🔒 已鎖定');
  }
};

$permRemoveBtn.onclick = () => {
  localStorage.removeItem(LS.pwd);
  sessionStorage.removeItem(LS.unlocked);
  isLocked = false;
  checkPermission();
  updateEditVisibility();
  closeModal('permModal');
  toast('✅ 密碼已移除');
};

// ─── Tag cloud ───────────────────────────────
function buildTagCloud() {
  const counts = {};
  db.forEach(d => (d.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));

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

// ─── Apply filters ───────────────────────────
function applyFilters() {
  const kw = $search.value.trim().toLowerCase();
  let pool = db.slice();

  if (activeFilter === 'starred') {
    pool = pool.filter(d => starred.has(d.id));
  } else if (activeFilter === 'recent') {
    const set = new Set(recentPaths);
    pool = pool.filter(d => set.has(d.id));
    pool.sort((a, b) => recentPaths.indexOf(a.id) - recentPaths.indexOf(b.id));
  }

  if (activeTag) pool = pool.filter(d => (d.tags || []).includes(activeTag));

  if (kw) {
    pool = pool.filter(d =>
      (d.title || '').toLowerCase().includes(kw) ||
      (d.desc  || '').toLowerCase().includes(kw) ||
      (d.tags  || []).some(t => t.toLowerCase().includes(kw))
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
    card.className = 'card' + (item.id === activeCard ? ' active' : '');

    const titleText = item.title || '未命名';
    const titleHTML = highlight ? escHi(titleText, highlight) : esc(titleText);
    const descHTML  = highlight && item.desc ? escHi(item.desc, highlight) : esc(item.desc || '');
    const tagsHTML  = (item.tags || []).map(t => `<span class="card-tag">${esc(t)}</span>`).join('');
    const isStarred = starred.has(item.id);
    const isLocal   = !!articles[item.id];

    card.innerHTML = `
      <span class="card-star${isStarred ? ' on' : ''}" title="收藏">☆</span>
      <div class="card-title">${titleHTML}</div>
      <div class="card-meta">
        ${tagsHTML}
        ${isLocal ? '<span class="card-badge">本地</span>' : ''}
      </div>
      ${item.desc ? `<div class="card-desc">${descHTML}</div>` : ''}
    `;

    card.querySelector('.card-star').onclick = e => {
      e.stopPropagation();
      toggleStar(item.id, card.querySelector('.card-star'));
    };

    card.onclick = () => openArticle(item, card);
    $cardList.appendChild(card);
  });
}

// ─── Open article ────────────────────────────
function openArticle(item, cardEl) {
  activeCard = item.id;

  document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
  if (cardEl) cardEl.classList.add('active');

  $welcomeScreen.style.display = 'none';
  $viewerToolbar.style.display = 'flex';
  $preview.style.display       = 'block';
  $sidebar.classList.add('collapsed');

  $viewerTitle.textContent = item.title || item.path || '未命名';
  $viewerTag.textContent   = (item.tags || []).join(' · ');
  $viewerTag.style.display = item.tags && item.tags.length ? 'inline' : 'none';
  $starBtn.className       = 'icon-btn' + (starred.has(item.id) ? ' starred' : '');

  // 載入內容
  if (articles[item.id]) {
    // 本地文章 → srcdoc
    const html = wrapArticleHTML(articles[item.id], item.title);
    $preview.removeAttribute('src');
    $preview.srcdoc = html;
  } else if (item.path) {
    // 檔案文章 → 嘗試 fetch + base tag
    $preview.removeAttribute('srcdoc');
    fetch(item.path)
      .then(r => { if (!r.ok) throw new Error(); return r.text(); })
      .then(html => {
        const base = item.path.substring(0, item.path.lastIndexOf('/') + 1);
        $preview.srcdoc = html.replace(/<head>/i, `<head><base href="${base}">`);
      })
      .catch(() => {
        $preview.src = item.path;
      });
  }

  pushRecent(item.id);
  updateEditVisibility();
}

function wrapArticleHTML(body, title) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${esc(title || '')}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC",sans-serif;
       max-width:760px;margin:0 auto;padding:40px 24px;line-height:1.8;color:#1a1a2e;font-size:15px}
  h1{font-size:1.8em;margin:0 0 .6em;color:#0f0f1a}
  h2{font-size:1.4em;margin:1.4em 0 .5em;color:#1a1a3e;border-bottom:2px solid #e8e8f0;padding-bottom:.3em}
  h3{font-size:1.15em;margin:1.2em 0 .4em;color:#2a2a4e}
  p{margin:0 0 1em}
  ul,ol{margin:0 0 1em 1.5em}
  li{margin-bottom:.3em}
  blockquote{border-left:4px solid #6c8cff;margin:1em 0;padding:.6em 1em;background:#f0f2ff;border-radius:0 6px 6px 0;color:#333}
  pre{background:#1e1e2e;color:#cdd6f4;padding:16px;border-radius:8px;overflow-x:auto;margin:1em 0;font-size:13px;line-height:1.6}
  code{font-family:"Fira Code",Consolas,monospace;font-size:.9em}
  :not(pre)>code{background:#f0f0f5;padding:2px 6px;border-radius:4px;color:#c7254e}
  a{color:#6c8cff;text-decoration:none} a:hover{text-decoration:underline}
  img{max-width:100%;border-radius:8px;margin:1em 0}
  hr{border:none;border-top:2px solid #e8e8f0;margin:2em 0}
  table{width:100%;border-collapse:collapse;margin:1em 0}
  th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}
  th{background:#f5f5fa}
</style></head><body>${body}</body></html>`;
}

// ─── Star ────────────────────────────────────
function toggleStar(id, chipEl) {
  if (starred.has(id)) {
    starred.delete(id);
    if (chipEl) chipEl.className = 'card-star';
    if (activeCard === id) $starBtn.className = 'icon-btn';
    toast('已取消收藏');
  } else {
    starred.add(id);
    if (chipEl) chipEl.className = 'card-star on';
    if (activeCard === id) $starBtn.className = 'icon-btn starred';
    toast('⭐ 已加入收藏');
  }
  localStorage.setItem(LS.starred, JSON.stringify([...starred]));
}

$starBtn.onclick = () => {
  if (!activeCard) return;
  const chipEl = document.querySelector('.card.active .card-star');
  toggleStar(activeCard, chipEl);
};

// ─── Recent ──────────────────────────────────
function pushRecent(id) {
  recentPaths = recentPaths.filter(p => p !== id);
  recentPaths.unshift(id);
  recentPaths = recentPaths.slice(0, 50);
  localStorage.setItem(LS.recent, JSON.stringify(recentPaths));
}

// ─── Viewer toolbar buttons ──────────────────
$newTabBtn.onclick = () => {
  if (!activeCard) return;
  const item = db.find(d => d.id === activeCard);
  if (!item) return;
  if (articles[item.id]) {
    // 本地文章 → 開新分頁寫入
    const w = window.open('', '_blank');
    w.document.write(wrapArticleHTML(articles[item.id], item.title));
    w.document.close();
  } else if (item.path) {
    window.open(item.path, '_blank');
  }
};

$closeBtn.onclick = () => {
  activeCard = null;
  $preview.src = 'about:blank';
  $preview.removeAttribute('srcdoc');
  $preview.style.display       = 'none';
  $viewerToolbar.style.display = 'none';
  $welcomeScreen.style.display = 'flex';
  $sidebar.classList.remove('collapsed');
  document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
};

$sidebarToggle.onclick = () => $sidebar.classList.toggle('collapsed');
$refreshBtn.onclick = () => { boot(); };

// ─── Stats ───────────────────────────────────
function renderStats() {
  const tags = new Set(db.flatMap(d => d.tags || []));
  $welcomeStats.innerHTML = `
    <div class="stat-item"><div class="stat-num">${db.length}</div><div class="stat-lbl">篇文章</div></div>
    <div class="stat-item"><div class="stat-num">${tags.size}</div><div class="stat-lbl">個標籤</div></div>
    <div class="stat-item"><div class="stat-num">${starred.size}</div><div class="stat-lbl">已收藏</div></div>
  `;
}

// ═══════════════════════════════════════════════
//  CRUD — 新增 / 編輯 / 刪除
// ═══════════════════════════════════════════════

// ─── 新增 ────────────────────────────────────
$addBtn.onclick = () => {
  if (isLocked) return toast('🔒 編輯已鎖定');
  editingId = null;
  $editorModalTitle.textContent = '新增文章';
  $edTitle.value = '';
  $edTags.value  = '';
  $edDesc.value  = '';
  $editorArea.innerHTML = '<p>在這裡開始寫作…</p>';
  $sourceArea.value = '';
  sourceMode = false;
  $editorArea.style.display = '';
  $sourceArea.style.display = 'none';
  openModal('editorModal');
  setTimeout(() => $edTitle.focus(), 200);
};

// ─── 編輯 ────────────────────────────────────
$editBtn.onclick = () => {
  if (isLocked) return toast('🔒 編輯已鎖定');
  if (!activeCard) return;
  const item = db.find(d => d.id === activeCard);
  if (!item) return;

  editingId = item.id;
  $editorModalTitle.textContent = '編輯文章';
  $edTitle.value = item.title || '';
  $edTags.value  = (item.tags || []).join(', ');
  $edDesc.value  = item.desc || '';
  sourceMode = false;
  $editorArea.style.display = '';
  $sourceArea.style.display = 'none';

  if (articles[item.id]) {
    $editorArea.innerHTML = articles[item.id];
  } else if (item.path) {
    // 從檔案載入
    $editorArea.innerHTML = '<p style="color:#888">載入中…</p>';
    fetch(item.path)
      .then(r => r.text())
      .then(html => {
        // 擷取 body 內容
        const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        $editorArea.innerHTML = m ? m[1] : html;
      })
      .catch(() => {
        $editorArea.innerHTML = '<p style="color:#f87171">無法載入檔案內容，請手動貼上。</p>';
      });
  } else {
    $editorArea.innerHTML = '';
  }

  openModal('editorModal');
};

// ─── 儲存 ────────────────────────────────────
$editorSaveBtn.onclick = () => {
  const title = $edTitle.value.trim();
  if (!title) return toast('⚠️ 請輸入標題');

  // 取得 HTML 內容
  const content = sourceMode ? $sourceArea.value : $editorArea.innerHTML;

  const tags = $edTags.value
    .split(/[,，]/)
    .map(t => t.trim())
    .filter(Boolean);

  const desc = $edDesc.value.trim();
  const now  = Date.now();

  if (editingId) {
    // 更新
    const idx = db.findIndex(d => d.id === editingId);
    if (idx === -1) return toast('❌ 找不到文章');
    db[idx].title   = title;
    db[idx].tags    = tags;
    db[idx].desc    = desc;
    db[idx].updated = now;
    articles[editingId] = content;
    toast('✅ 已更新');
  } else {
    // 新增
    const id = genId();
    db.unshift({
      id, title, desc, tags,
      path: '',
      created: now,
      updated: now,
    });
    articles[id] = content;
    toast('✅ 已新增「' + title + '」');
  }

  saveState();
  buildTagCloud();
  applyFilters();
  renderStats();
  closeModal('editorModal');

  // 自動打開剛儲存的文章
  const targetId = editingId || db[0].id;
  const item = db.find(d => d.id === targetId);
  if (item) {
    const cardEl = $cardList.querySelector('.card');
    openArticle(item, cardEl);
  }
};

// ─── 刪除 ────────────────────────────────────
$deleteBtn.onclick = () => {
  if (isLocked) return toast('🔒 編輯已鎖定');
  if (!activeCard) return;
  const item = db.find(d => d.id === activeCard);
  if (!item) return;

  $deleteTarget.textContent = item.title || '未命名';
  openModal('deleteModal');
};

$confirmDeleteBtn.onclick = () => {
  if (!activeCard) return;
  const idx = db.findIndex(d => d.id === activeCard);
  if (idx === -1) return;

  // 移除
  const removed = db.splice(idx, 1)[0];
  delete articles[removed.id];
  starred.delete(removed.id);
  recentPaths = recentPaths.filter(p => p !== removed.id);

  saveState();
  localStorage.setItem(LS.starred, JSON.stringify([...starred]));
  localStorage.setItem(LS.recent, JSON.stringify(recentPaths));

  // 關閉 viewer
  $closeBtn.click();
  buildTagCloud();
  applyFilters();
  renderStats();
  closeModal('deleteModal');
  toast('🗑 已刪除「' + (removed.title || '未命名') + '」');
};

// ═══════════════════════════════════════════════
//  WYSIWYG 編輯器
// ═══════════════════════════════════════════════

// 基本指令按鈕
document.querySelectorAll('.wysiwyg-toolbar [data-cmd]').forEach(btn => {
  btn.onmousedown = e => e.preventDefault(); // 防止失去焦點
  btn.onclick = () => {
    $editorArea.focus();
    const cmd = btn.dataset.cmd;
    const val = btn.dataset.val || null;
    document.execCommand(cmd, false, val);
  };
});

// 插入程式碼區塊
$('insertCodeBtn').onclick = () => {
  $editorArea.focus();
  document.execCommand('insertHTML', false, '<pre><code>// 在此輸入程式碼</code></pre><p></p>');
};

// 插入連結
$('insertLinkBtn').onclick = () => {
  const url = prompt('輸入連結 URL：', 'https://');
  if (url) {
    $editorArea.focus();
    document.execCommand('createLink', false, url);
  }
};

// 插入分隔線
$('insertHrBtn').onclick = () => {
  $editorArea.focus();
  document.execCommand('insertHTML', false, '<hr>');
};

// 切換原始碼模式
$('toggleSourceBtn').onclick = () => {
  sourceMode = !sourceMode;
  if (sourceMode) {
    $sourceArea.value = $editorArea.innerHTML;
    $editorArea.style.display = 'none';
    $sourceArea.style.display = '';
    $sourceArea.focus();
  } else {
    $editorArea.innerHTML = $sourceArea.value;
    $sourceArea.style.display = 'none';
    $editorArea.style.display = '';
    $editorArea.focus();
  }
  $('toggleSourceBtn').classList.toggle('active', sourceMode);
};

// 字數統計
$editorArea.addEventListener('input', updateCharCount);
$sourceArea.addEventListener('input', updateCharCount);

function updateCharCount() {
  const text = sourceMode ? $sourceArea.value : $editorArea.innerText;
  $editorCharCount.textContent = text.trim().length + ' 字';
}

// ═══════════════════════════════════════════════
//  同步 — 匯出 / 匯入
// ═══════════════════════════════════════════════

$syncBtn.onclick = () => openModal('syncModal');

// 匯出
$exportBtn.onclick = () => {
  const payload = {
    version: 2,
    exported: new Date().toISOString(),
    db,
    articles,
    starred: [...starred],
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = '知識庫_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('📤 已匯出 ' + db.length + ' 篇文章');
  closeModal('syncModal');
};

// 匯入
$importBtn.onclick = () => $importFile.click();

$importFile.onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.db || !Array.isArray(data.db)) throw new Error('格式錯誤');

      // 合併策略：以 id 為 key，匯入的覆蓋現有的
      const existingIds = new Set(db.map(d => d.id));
      let added = 0, updated = 0;

      data.db.forEach(item => {
        if (existingIds.has(item.id)) {
          const idx = db.findIndex(d => d.id === item.id);
          db[idx] = item;
          updated++;
        } else {
          db.push(item);
          added++;
        }
      });

      // 合併 articles
      if (data.articles) {
        Object.assign(articles, data.articles);
      }

      // 合併 starred
      if (data.starred) {
        data.starred.forEach(s => starred.add(s));
        localStorage.setItem(LS.starred, JSON.stringify([...starred]));
      }

      saveState();
      buildTagCloud();
      applyFilters();
      renderStats();
      toast(`📥 匯入完成：新增 ${added} 篇，更新 ${updated} 篇`);
    } catch (err) {
      toast('❌ 匯入失敗：' + err.message, 3000);
    }
    $importFile.value = '';
    closeModal('syncModal');
  };
  reader.readAsText(file);
};

// 從 database.js 重新匯入
$importDbBtn.onclick = () => {
  if (typeof database === 'undefined' || !Array.isArray(database)) {
    return toast('❌ 找不到 database.js');
  }

  const existingPaths = new Set(db.map(d => d.path).filter(Boolean));
  let added = 0;

  database.forEach(d => {
    if (d.path && !existingPaths.has(d.path)) {
      db.push({
        id:      genId(),
        title:   d.title || '未命名',
        desc:    d.desc || '',
        tags:    d.tags || [],
        path:    d.path,
        created: Date.now(),
        updated: Date.now(),
      });
      added++;
    }
  });

  if (added > 0) {
    saveState();
    buildTagCloud();
    applyFilters();
    renderStats();
    toast(`📂 已合併 ${added} 篇新檔案`);
  } else {
    toast('ℹ️ 沒有新的檔案需要匯入');
  }
  closeModal('syncModal');
};

// ═══════════════════════════════════════════════
//  Modal helpers
// ═══════════════════════════════════════════════

function openModal(id) {
  $(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  $(id).classList.remove('open');
  document.body.style.overflow = '';
}

// 關閉按鈕
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.onclick = () => closeModal(btn.dataset.close);
});

// 點擊 overlay 關閉
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.onclick = e => {
    if (e.target === overlay) closeModal(overlay.id);
  };
});

// ═══════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════

function genId() {
  return 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function toast(msg, duration = 2200) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), duration);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escHi(str, kw) {
  const e = esc(str);
  const k = esc(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return e.replace(new RegExp(`(${k})`, 'gi'), '<mark>$1</mark>');
}

// ─── Keyboard shortcuts ──────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    $search.focus();
    $search.select();
  }
  if (e.key === 'Escape') {
    // 關閉最上層的 modal
    const openModals = document.querySelectorAll('.modal-overlay.open');
    if (openModals.length) {
      closeModal(openModals[openModals.length - 1].id);
    } else if ($search.value) {
      $search.value = '';
      $clearBtn.classList.remove('visible');
      applyFilters();
    } else if (activeCard) {
      $closeBtn.click();
    }
  }
  // Ctrl+N → 新增
  if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !isLocked) {
    e.preventDefault();
    $addBtn.click();
  }
});
