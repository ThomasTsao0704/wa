#!/usr/bin/env node
/* ═══════════════════════════════════════════
   generate.js — 掃描 database/ 自動產生 database.js
   用法：node generate.js
   ═══════════════════════════════════════════ */

'use strict';

const fs   = require('fs');
const path = require('path');

const DB_DIR    = path.join(__dirname, 'database');
const OUT_FILE  = path.join(__dirname, 'database.js');

// ─── 遞迴掃描所有 .html ─────────────────────
function getHTMLFiles(dirPath) {
  let results = [];
  const list = fs.readdirSync(dirPath);

  list.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      results = results.concat(getHTMLFiles(filePath));
    } else if (file.endsWith('.html') || file.endsWith('.htm')) {
      results.push(filePath);
    }
  });

  return results;
}

// ─── 擷取 <title> ────────────────────────────
function extractTitle(content) {
  const match = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : '未命名文章';
}

// ─── 擷取 <meta name="tags"> ─────────────────
function extractTags(content) {
  const match = content.match(/<meta\s+name=["']tags["']\s+content=["'](.*?)["']/i);
  return match ? match[1].split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
}

// ─── 擷取 <meta name="description"> ──────────
function extractDesc(content) {
  const match = content.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
  return match ? match[1].trim() : '';
}

// ─── 主流程 ──────────────────────────────────
function build() {
  if (!fs.existsSync(DB_DIR)) {
    console.error('❌ 找不到 database/ 資料夾，請先建立');
    process.exit(1);
  }

  const files = getHTMLFiles(DB_DIR);

  if (files.length === 0) {
    console.warn('⚠️  database/ 裡沒有任何 .html 檔案');
  }

  const data = files.map(file => {
    const relPath = path.relative(__dirname, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf-8');

    return {
      title: extractTitle(content),
      desc:  extractDesc(content),
      tags:  extractTags(content),
      path:  relPath
    };
  });

  // 按路徑排序
  data.sort((a, b) => a.path.localeCompare(b.path));

  const output = `/* 自動產生 — 請勿手動修改 */\n/* 產生時間：${new Date().toISOString()} */\nconst database = ${JSON.stringify(data, null, 2)};\n`;

  fs.writeFileSync(OUT_FILE, output, 'utf-8');

  console.log(`✅ 已掃描 database/ → 產生 ${data.length} 筆資料`);
  data.forEach(d => console.log(`   📄 ${d.path}  →  ${d.title}`));
}

build();
