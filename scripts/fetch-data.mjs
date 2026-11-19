#!/usr/bin/env node
// 抓取 DXY / 2Y / 10Y，輸出 site/data/data.json。
// 環境變數：
//   PREV_DATA_URL  上一版已發布的 data.json 網址（GitHub Actions 用）；未設定時讀本機 site/data/data.json
//   YEARS          抓幾年歷史（預設 10）

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDxy, fetchTreasury, fetchFredYields, fetchText } from './lib/sources.mjs';
import { buildDataset } from './lib/dataset.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'site/data/data.json');

async function loadPrevious() {
  const url = process.env.PREV_DATA_URL;
  try {
    if (url) return JSON.parse(await fetchText(`${url}?t=${Date.now()}`, { timeoutMs: 15000, retries: 0 }));
    return JSON.parse(await readFile(outFile, 'utf8'));
  } catch (e) {
    console.log(`（沒有可沿用的上一版資料：${e.message}）`);
    return null;
  }
}

export async function run() {
  const now = new Date();
  const years = Number(process.env.YEARS ?? 10);
  const startYear = now.getUTCFullYear() - years;
  const startDate = `${startYear}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const yearList = Array.from({ length: years + 1 }, (_, i) => startYear + i);

  const prev = await loadPrevious();
  const result = await buildDataset({
    now,
    prev,
    startDate,
    fetchers: {
      dxy: fetchDxy,
      treasury: () => fetchTreasury(yearList),
      fred: () => fetchFredYields(startDate),
    },
  });

  if (!result.ok) {
    console.error(`✖ ${result.error}`);
    process.exitCode = 1;
    return;
  }

  const { data } = result;
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(data));
  const last = data.rows[data.rows.length - 1];
  console.log(`✔ 已寫入 ${outFile}（${data.rows.length} 筆，最新 ${last?.[0]}）`);
  for (const [k, s] of Object.entries(data.sources)) {
    console.log(`  ${k}: ${s.status} · ${s.name} · 最新 ${s.lastDate}${s.error ? ` · ${s.error}` : ''}`);
  }
  if (data.dxyQuote) console.log(`  DXY 最新報價 ${data.dxyQuote.price} @ ${data.dxyQuote.time}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
