const MINUS = '−';

export function fmt(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return '–';
  const s = Math.abs(v).toFixed(digits);
  return v < 0 ? MINUS + s : s;
}

export function signed(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return '–';
  const s = Math.abs(v).toFixed(digits);
  if (Number(s) === 0) return '±' + s;
  return (v > 0 ? '+' : MINUS) + s;
}

export function arrow(v) {
  if (v == null || !Number.isFinite(v) || v === 0) return '→';
  return v > 0 ? '▲' : '▼';
}

/** 百分點 → 基點 */
export function bp(v) {
  if (v == null || !Number.isFinite(v)) return '–';
  const n = Math.round(v * 100);
  if (n === 0) return '±0 bp';
  return `${n > 0 ? '+' : MINUS}${Math.abs(n)} bp`;
}

export function dateTs(d) {
  return Date.parse(`${d}T00:00:00Z`);
}

export function localDateTime(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function relTime(iso, now = Date.now()) {
  if (!iso) return '';
  const mins = Math.round((now - Date.parse(iso)) / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} 小時前`;
  return `${Math.round(h / 24)} 天前`;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
