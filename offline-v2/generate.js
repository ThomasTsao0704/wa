#!/usr/bin/env node
/* ═══════════════════════════════════════════
   generate.js — 掃描 database/ 自動產生 database.js
   用法：node generate.js
   ═══════════════════════════════════════════ */
'use strict';

const fs   = require('fs');
const path = require('path');

const DB_DIR   = path.join(__dirname, 'database');
const OUT_FILE = path.join(__dirname, 'database.js');

function getHTMLFiles(dirPath) {
  let results = [];
  if (!fs.existsSync(dirPath)) return results;
  fs.readdirSync(dirPath).forEach(file => {
    const fp = path.join(dirPath, file);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) results = results.concat(getHTMLFiles(fp));
    else if (/\.html?$/i.test(file)) results.push(fp);
  });
  return results;
}

function extract(content, regex) {
  const m = content.match(regex);
  return m ? m[1].trim() : '';
}

function build() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR);
    console.log('📁 已建立 database/ 資料夾');
  }

  const files = getHTMLFiles(DB_DIR);

  const data = files.map(file => {
    const relPath = path.relative(__dirname, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf-8');
    const title = extract(content, /<title[^>]*>([\s\S]*?)<\/title>/i) || '未命名文章';
    const desc  = extract(content, /<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    const tagsRaw = extract(content, /<meta\s+name=["']tags["']\s+content=["'](.*?)["']/i);
    const tags  = tagsRaw ? tagsRaw.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

    return { title, desc, tags, path: relPath };
  });

  data.sort((a, b) => a.path.localeCompare(b.path));

  const output = `/* 自動產生 — ${new Date().toISOString()} */\nconst database = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(OUT_FILE, output, 'utf-8');

  console.log(`✅ 已掃描 database/ → 產生 ${data.length} 筆資料`);
  data.forEach(d => console.log(`   📄 ${d.path}  →  ${d.title}`));
}

build();
