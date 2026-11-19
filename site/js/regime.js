// 四象限判讀邏輯（純函式，Node 與瀏覽器共用）。
// rows: [date, dxy, y2, y10, spread][]，日期由舊到新。

export const WEAK_DXY_PCT = 0.005; // |ΔDXY| < 0.5% 視為訊號偏弱
export const WEAK_SPREAD = 0.05; // |Δ利差| < 0.05 個百分點視為訊號偏弱

const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/** 只保留四個值都齊全的列 */
export function completeRows(rows) {
  return rows.filter((r) => r[1] != null && r[2] != null && r[3] != null && r[4] != null);
}

/** 曲線型態：依 Δ2Y、Δ10Y 判斷 */
export function curveShape(d2y, d10y) {
  const dSpread = round(d10y - d2y);
  if (d2y > 0 && d10y > 0) return dSpread > 0 ? '熊陡' : '熊平';
  if (d2y < 0 && d10y < 0) return dSpread > 0 ? '牛陡' : '牛平';
  if (dSpread > 0) return '扭轉陡峭';
  if (dSpread < 0) return '扭轉平坦';
  return '持平';
}

/** 由變化量決定組合 key */
export function regimeKey(dDxy, dSpread) {
  const dollar = dDxy > 0 ? 'up' : 'down';
  const curve = dSpread > 0 ? 'up' : 'down';
  return `${dollar}-${curve}`;
}

/** 訊號強弱 */
export function isWeak(dDxy, dxyPrev, dSpread) {
  return Math.abs(dDxy) < Math.abs(dxyPrev) * WEAK_DXY_PCT || Math.abs(dSpread) < WEAK_SPREAD;
}

/**
 * 計算每個交易日的判讀。
 * 回傳與 completeRows(rows) 等長的陣列；前 lookback 筆的 regime 為 null（資料不足）。
 */
export function classify(rows, lookback) {
  if (!Number.isInteger(lookback) || lookback < 1) throw new Error(`lookback 必須是正整數：${lookback}`);
  const data = completeRows(rows);
  return data.map((row, i) => {
    const [date, dxy, y2, y10, spread] = row;
    if (i < lookback) {
      return { date, dxy, y2, y10, spread, regime: null };
    }
    const prev = data[i - lookback];
    const dDxy = round(dxy - prev[1]);
    const d2y = round(y2 - prev[2]);
    const d10y = round(y10 - prev[3]);
    const dSpread = round(spread - prev[4]);
    return {
      date,
      dxy,
      y2,
      y10,
      spread,
      prevDate: prev[0],
      dDxy,
      dDxyPct: round((dDxy / prev[1]) * 100, 3),
      d2y,
      d10y,
      dSpread,
      regime: regimeKey(dDxy, dSpread),
      curveShape: curveShape(d2y, d10y),
      weak: isWeak(dDxy, prev[1], dSpread),
    };
  });
}

/** 把連續相同組合的日期合併成區段，給色帶用：[{ start, end, regime }] */
export function regimeSegments(results) {
  const segs = [];
  for (const r of results) {
    if (!r.regime) continue;
    const last = segs[segs.length - 1];
    if (last && last.regime === r.regime) {
      last.end = r.date;
    } else {
      segs.push({ start: r.date, end: r.date, regime: r.regime });
    }
  }
  return segs;
}
