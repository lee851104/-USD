// 合併各來源成網站用的資料檔。所有外部呼叫都由參數注入，方便測試。

const round2 = (v) => Math.round(v * 100) / 100;

export function lastDateOf(map, pick = (v) => v) {
  let last = null;
  for (const [d, v] of map) {
    const val = pick(v);
    if (val != null && (last === null || d > last)) last = d;
  }
  return last;
}

/** 合併 DXY 與殖利率成 rows：[date, dxy, y2, y10, spread]，由舊到新、日期唯一 */
export function buildRows(dxyMap, yieldMap, startDate = '0000-00-00') {
  const dates = new Set([...dxyMap.keys(), ...yieldMap.keys()]);
  const rows = [];
  for (const d of [...dates].sort()) {
    if (d < startDate || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const dxy = dxyMap.get(d) ?? null;
    const y = yieldMap.get(d);
    const y2 = y?.y2 ?? null;
    const y10 = y?.y10 ?? null;
    const spread = y2 != null && y10 != null ? round2(y10 - y2) : null;
    if (dxy == null && y2 == null && y10 == null) continue;
    rows.push([d, dxy, y2, y10, spread]);
  }
  return rows;
}

/** 從上一版資料檔還原各來源的 Map */
export function mapsFromPrevious(prev) {
  const dxy = new Map();
  const yields = new Map();
  for (const [d, x, y2, y10] of prev?.rows ?? []) {
    if (x != null) dxy.set(d, x);
    if (y2 != null || y10 != null) yields.set(d, { y2, y10 });
  }
  return { dxy, yields };
}

/**
 * fetchers: { dxy: () => {points, quote}, treasury: () => Map, fred: () => Map }
 * prev: 上一版資料檔（物件）或 null
 * 回傳 { ok: true, data } 或 { ok: false, error }
 */
export async function buildDataset({ fetchers, prev = null, now = new Date(), startDate }) {
  const prevMaps = prev ? mapsFromPrevious(prev) : null;
  const sources = {};
  let dxyMap = null;
  let dxyQuote = null;
  let yieldMap = null;

  // DXY
  try {
    const { points, quote } = await fetchers.dxy();
    dxyMap = points;
    dxyQuote = quote;
    sources.dxy = { name: 'Yahoo Finance DX-Y.NYB', status: 'ok', error: null };
  } catch (e) {
    if (prevMaps?.dxy.size) {
      dxyMap = prevMaps.dxy;
      dxyQuote = prev.dxyQuote ?? null;
      sources.dxy = { name: 'Yahoo Finance DX-Y.NYB（沿用上一版）', status: 'stale', error: e.message };
    } else {
      sources.dxy = { name: 'Yahoo Finance DX-Y.NYB', status: 'error', error: e.message };
    }
  }

  // 2Y / 10Y
  try {
    yieldMap = await fetchers.treasury();
    sources.treasury = { name: 'U.S. Treasury Daily Par Yield Curve', status: 'ok', error: null };
  } catch (e1) {
    try {
      yieldMap = await fetchers.fred();
      sources.treasury = { name: 'FRED DGS2 / DGS10（備援）', status: 'fallback', error: `財政部來源失敗：${e1.message}` };
    } catch (e2) {
      const msg = `財政部：${e1.message}；FRED：${e2.message}`;
      if (prevMaps?.yields.size) {
        yieldMap = prevMaps.yields;
        sources.treasury = { name: '美債殖利率（沿用上一版）', status: 'stale', error: msg };
      } else {
        sources.treasury = { name: 'U.S. Treasury / FRED', status: 'error', error: msg };
      }
    }
  }

  if (!dxyMap || !yieldMap) {
    const failed = Object.entries(sources)
      .filter(([, s]) => s.status === 'error')
      .map(([k, s]) => `${k}: ${s.error}`);
    return { ok: false, error: `無法取得資料且沒有上一版可沿用 — ${failed.join(' | ')}` };
  }

  sources.dxy.lastDate = lastDateOf(dxyMap);
  sources.treasury.lastDate = lastDateOf(yieldMap, (v) => v?.y10);

  return {
    ok: true,
    data: {
      generatedAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      sources,
      dxyQuote,
      columns: ['date', 'dxy', 'y2', 'y10', 'spread'],
      rows: buildRows(dxyMap, yieldMap, startDate),
    },
  };
}
