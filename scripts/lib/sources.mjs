// 外部資料來源：抓取與解析。解析函式為純函式，方便測試。

const UA = 'Mozilla/5.0 (compatible; usd-yield-curve-dashboard/1.0)';

export async function fetchText(url, { timeoutMs = 20000, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: '*/*' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`${lastErr?.name === 'TimeoutError' ? '逾時' : lastErr?.message ?? lastErr} (${url})`);
}

// ---------- 通用 CSV ----------

export function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const split = (line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = split(lines[0]);
  return lines.slice(1).filter(Boolean).map((l) => {
    const cells = split(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

const num = (s) => {
  if (s == null || s === '' || s === '.' || s === 'N/A') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// ---------- Yahoo Finance：DXY ----------

export function yahooChartUrl(host = 'query1') {
  return `https://${host}.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=10y&interval=1d&includePrePost=false`;
}

/** 回傳 { points: Map<date, close>, quote: {price, time} | null } */
export function parseYahooChart(text) {
  const json = JSON.parse(text);
  const err = json?.chart?.error;
  if (err) throw new Error(`Yahoo: ${err.description ?? err.code}`);
  const r = json?.chart?.result?.[0];
  if (!r?.timestamp?.length) throw new Error('Yahoo: 回應中沒有資料');
  // 用交易所時區換算日期（meta.gmtoffset 只是「現在」的偏移，夏令時間的 K 棒會差一小時而落到前一天）
  const tz = r.meta?.exchangeTimezoneName || 'America/New_York';
  const toDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const closes = r.indicators?.quote?.[0]?.close ?? [];
  const points = new Map();
  r.timestamp.forEach((ts, i) => {
    const close = closes[i];
    if (close == null) return;
    const date = toDate.format(new Date(ts * 1000));
    // 同一交易日只取第一筆（盤中即時 K 棒的時間戳可能落在前一日，避免覆寫已收盤的值）
    if (!points.has(date)) points.set(date, Math.round(close * 1000) / 1000);
  });
  const price = r.meta?.regularMarketPrice;
  const t = r.meta?.regularMarketTime;
  const quote = price != null && t ? { price, time: new Date(t * 1000).toISOString() } : null;
  return { points, quote };
}

export async function fetchDxy() {
  const errors = [];
  for (const host of ['query1', 'query2']) {
    try {
      return parseYahooChart(await fetchText(yahooChartUrl(host)));
    } catch (e) {
      errors.push(e.message);
    }
  }
  throw new Error(errors.join('；'));
}

// ---------- U.S. Treasury：2Y / 10Y ----------

export function treasuryUrl(year) {
  return `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
}

/** 回傳 Map<date, {y2, y10}> */
export function parseTreasuryCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length || !('2 Yr' in rows[0]) || !('10 Yr' in rows[0])) {
    throw new Error('Treasury: CSV 格式不符（找不到 2 Yr / 10 Yr 欄位）');
  }
  const out = new Map();
  for (const row of rows) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row.Date ?? '');
    if (!m) continue;
    out.set(`${m[3]}-${m[1]}-${m[2]}`, { y2: num(row['2 Yr']), y10: num(row['10 Yr']) });
  }
  return out;
}

export async function fetchTreasury(years) {
  const out = new Map();
  // 並行抓各年度；當年度必須成功，舊年度失敗則整體失敗（避免歷史出現缺口）
  const parts = await Promise.all(years.map(async (y) => parseTreasuryCsv(await fetchText(treasuryUrl(y)))));
  for (const p of parts) for (const [d, v] of p) out.set(d, v);
  if (!out.size) throw new Error('Treasury: 沒有資料');
  return out;
}

// ---------- FRED（備援） ----------

export function fredUrl(id, start) {
  return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`;
}

/** 回傳 Map<date, value> */
export function parseFredCsv(text, id) {
  const rows = parseCsv(text);
  const dateKey = rows[0] && ('observation_date' in rows[0] ? 'observation_date' : 'DATE');
  if (!rows.length || !(id in rows[0])) throw new Error(`FRED: CSV 格式不符（找不到 ${id}）`);
  const out = new Map();
  for (const row of rows) out.set(row[dateKey], num(row[id]));
  return out;
}

export async function fetchFredYields(start) {
  const [y2, y10] = await Promise.all(
    ['DGS2', 'DGS10'].map(async (id) => parseFredCsv(await fetchText(fredUrl(id, start), { timeoutMs: 30000 }), id)),
  );
  const out = new Map();
  for (const [d, v] of y2) out.set(d, { y2: v, y10: y10.get(d) ?? null });
  return out;
}
