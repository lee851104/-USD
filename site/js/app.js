import { REGIMES, MATRIX_ORDER, LOOKBACKS, DEFAULT_LOOKBACK } from './regimes.js';
import { classify } from './regime.js';
import { fmt, signed, arrow, bp, localDateTime, relTime, esc } from './format.js';
import { getItem, setItem } from './store.js';
import { createChart } from './chart.js';
import { manualRefresh, isLocal, getSettings, saveSettings, clearToken } from './refresh.js';

const AUTO_RELOAD_MS = 10 * 60000;
const SHARE_WINDOW = 504; // 約 2 年交易日

const $ = (id) => document.getElementById(id);
const state = {
  data: null,
  lookback: Number(getItem('lookback')) || DEFAULT_LOOKBACK,
  lastLoad: 0,
  busy: false,
};
if (!LOOKBACKS.includes(state.lookback)) state.lookback = DEFAULT_LOOKBACK;

let chart = null;

// ---------- 資料載入 ----------

async function loadData({ quiet = false } = {}) {
  const main = $('main');
  if (state.data && !quiet) main.classList.add('reloading');
  try {
    const res = await fetch(`data/data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.rows?.length) throw new Error('資料檔是空的');
    const changed = !state.data || data.generatedAt !== state.data.generatedAt;
    state.data = data;
    state.lastLoad = Date.now();
    if (changed) render();
    else renderStatus();
    return data.generatedAt;
  } catch (e) {
    if (!state.data) {
      $('status-line').textContent = '';
      showAlerts([{ error: true, html: `<b>無法載入資料</b>：${esc(e.message)}。${isLocal() ? '請先執行 <code>npm run fetch</code>。' : '請稍後重新整理。'}` }]);
    }
    throw e;
  } finally {
    main.classList.remove('reloading');
    main.setAttribute('aria-busy', 'false');
  }
}

// ---------- 渲染 ----------

function seriesOf(rows, col) {
  const out = [];
  for (const r of rows) if (r[col] != null) out.push([r[0], r[col]]);
  return out;
}

function render() {
  const { data, lookback } = state;
  const results = classify(data.rows, lookback);
  const latest = [...results].reverse().find((r) => r.regime);
  renderStatus();
  renderNow(latest, results);
  renderCards(data, latest);
  renderTable(results);
  renderLegend();
  if (window.echarts) {
    chart ??= createChart($('chart'));
    chart.render(data.rows, results);
  } else {
    $('chart').textContent = '圖表程式庫載入失敗，請檢查網路後重新整理。';
  }
}

function renderStatus() {
  const { data } = state;
  const s = data.sources;
  const parts = [
    `資料更新於 <b>${esc(localDateTime(data.generatedAt))}</b>（${esc(relTime(data.generatedAt))}）`,
    `DXY 至 ${esc(s.dxy?.lastDate ?? '–')}`,
    `美債至 ${esc(s.treasury?.lastDate ?? '–')}`,
  ];
  $('status-line').innerHTML = parts.join(' · ');

  const alerts = [];
  const label = { dxy: 'DXY', treasury: '美債殖利率' };
  for (const [k, src] of Object.entries(s)) {
    if (src.status === 'stale') {
      alerts.push({ html: `<b>${label[k] ?? k} 來源暫時失敗</b>，顯示的是先前的資料。原因：${esc(src.error ?? '未知')}` });
    } else if (src.status === 'fallback') {
      alerts.push({ html: `<b>${label[k] ?? k} 使用備援來源</b>（${esc(src.name)}）。${esc(src.error ?? '')}` });
    }
  }
  const ageH = (Date.now() - Date.parse(data.generatedAt)) / 3600000;
  if (ageH > 6) alerts.push({ html: `<b>資料已超過 ${Math.floor(ageH)} 小時沒有更新</b>，自動排程可能被停用，可按「立即更新」或到 GitHub Actions 重新啟用。` });
  showAlerts(alerts);
}

function showAlerts(list) {
  $('alerts').innerHTML = list.map((a) => `<div class="alert${a.error ? ' error' : ''}">${a.html}</div>`).join('');
}

function renderNow(latest, results) {
  const card = $('now-card');
  if (!latest) {
    card.removeAttribute('data-regime');
    $('now-name').textContent = '資料不足';
    return;
  }
  const R = REGIMES[latest.regime];
  card.dataset.regime = latest.regime;
  $('now-badge').textContent = R.num;
  $('now-name').textContent = R.name;
  $('now-eyebrow').textContent = `目前組合 · 回看 ${state.lookback} 個交易日（${latest.prevDate} → ${latest.date}）`;
  const chips = [
    `DXY ${arrow(latest.dDxy)} ${signed(latest.dDxyPct, 2)}%（${R.dollar}）`,
    `利差 ${arrow(latest.dSpread)} ${bp(latest.dSpread)}（${R.curve}）`,
    `曲線型態：${latest.curveShape}（2Y ${bp(latest.d2y)}、10Y ${bp(latest.d10y)}）`,
  ];
  let html = chips.map((t) => `<span class="chip">${esc(t)}</span>`).join('');
  if (latest.weak) html += `<span class="chip weak">⚠ 訊號偏弱</span>`;
  $('now-meta').innerHTML = html;
  $('now-driver').textContent = R.driver;
  $('now-assets').textContent = R.assets;

  // 矩陣 + 近 2 年分佈
  const recent = results.filter((r) => r.regime).slice(-SHARE_WINDOW);
  const counts = Object.fromEntries(MATRIX_ORDER.map((k) => [k, 0]));
  for (const r of recent) counts[r.regime]++;
  const rowLabel = ['曲線走陡', '曲線走平'];
  let m = '';
  MATRIX_ORDER.forEach((key, i) => {
    if (i % 2 === 0) m += `<div class="axis-y">${rowLabel[i / 2]}</div>`;
    const X = REGIMES[key];
    const share = recent.length ? Math.round((counts[key] / recent.length) * 100) : 0;
    const cur = key === latest.regime;
    m += `<div class="cell${cur ? ' current' : ''}" data-regime="${key}" ${cur ? 'aria-current="true"' : ''}>
      <div class="cell-head"><span class="badge">${X.num}</span>${esc(X.name)}</div>
      <div class="cell-sub">${esc(X.dollar)} + ${esc(X.curve)}</div>
      <div class="cell-sub">${esc(X.typical)}</div>
      <div class="cell-share">近 2 年 ${share}% 的交易日</div>
    </div>`;
  });
  $('matrix').innerHTML = m;
}

function spark(points, { zero = false } = {}) {
  const pts = points.slice(-120);
  if (pts.length < 2) return '';
  const vals = pts.map((p) => p[1]);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (zero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  const W = 200;
  const H = 40;
  const pad = 4;
  const x = (i) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v) => pad + (1 - (v - min) / (max - min || 1)) * (H - pad * 2);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const zeroLine = zero && min < 0 && max > 0 ? `<line class="zero" x1="${pad}" x2="${W - pad}" y1="${y(0)}" y2="${y(0)}" stroke-width="1"/>` : '';
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${zeroLine}<path d="${d}" vector-effect="non-scaling-stroke"/><circle cx="${x(pts.length - 1)}" cy="${y(vals[vals.length - 1])}" r="3"/></svg>`;
}

// 卡片的數值與變化量都以「目前組合」用的同一對日期計算（兩來源都有資料的交易日），
// 避免美債休市日造成卡片與判讀對不上。
function renderCards(data, latest) {
  const N = state.lookback;
  const defs = [
    { col: 1, key: 'dxy', name: 'DXY 美元指數', unit: '', digits: 2, pct: true },
    { col: 2, key: 'y2', name: '2Y 美債殖利率', unit: '%', digits: 2 },
    { col: 3, key: 'y10', name: '10Y 美債殖利率', unit: '%', digits: 2 },
    { col: 4, key: 'spread', name: '10Y − 2Y 利差', unit: '', digits: 2, spread: true },
  ];
  const prevRow = latest && data.rows.find((r) => r[0] === latest.prevDate);
  $('cards').innerHTML = defs
    .map((d) => {
      const s = seriesOf(data.rows, d.col);
      const date = latest?.date ?? '–';
      const v = latest?.[d.key] ?? null;
      const prev = prevRow?.[d.col] ?? null;
      const delta = prev != null && v != null ? v - prev : null;
      let deltaTxt;
      if (d.pct) deltaTxt = `${arrow(delta)} <b>${signed(delta, 2)}</b>（${signed(prev ? (delta / prev) * 100 : null, 2)}%）`;
      else deltaTxt = `${arrow(delta)} <b>${bp(delta)}</b>`;
      let note = `${esc(date)} 收盤`;
      if (d.pct && data.dxyQuote) note = `即時 ${fmt(data.dxyQuote.price, 2)}（${esc(localDateTime(data.dxyQuote.time))}）`;
      if (d.spread && v != null) note = v < 0 ? `${esc(date)} · 殖利率曲線倒掛` : `${esc(date)} · 正斜率`;
      return `<article class="card">
        <div class="card-name"><span>${d.name}</span><small>${N} 日變化</small></div>
        <div class="card-value">${fmt(v, d.digits)}${d.unit ? `<span class="unit">${d.unit}</span>` : d.spread ? '<span class="unit">百分點</span>' : ''}</div>
        <div class="card-delta">${deltaTxt}</div>
        <div class="card-note">${note}</div>
        ${spark(s, { zero: d.spread })}
      </article>`;
    })
    .join('');
}

function renderTable(results) {
  const rows = results.filter((r) => r.regime).slice(-30).reverse();
  let html = '<thead><tr><th>日期</th><th>DXY</th><th>2Y (%)</th><th>10Y (%)</th><th>利差</th><th>組合</th></tr></thead><tbody>';
  for (const r of rows) {
    const R = REGIMES[r.regime];
    html += `<tr><td>${esc(r.date)}</td><td>${fmt(r.dxy, 2)}</td><td>${fmt(r.y2, 2)}</td><td>${fmt(r.y10, 2)}</td><td>${fmt(r.spread, 2)}</td>
      <td data-regime="${r.regime}"><span class="badge">${R.num}</span>${esc(R.name)}${r.weak ? '（弱）' : ''}</td></tr>`;
  }
  $('data-table').innerHTML = html + '</tbody>';
}

function renderLegend() {
  const items = [
    '<span style="color:var(--s1)"><i></i><span style="color:var(--ink-2)">2Y</span></span>',
    '<span style="color:var(--s2)"><i></i><span style="color:var(--ink-2)">10Y</span></span>',
    ...MATRIX_ORDER.slice()
      .sort((a, b) => REGIMES[a].num - REGIMES[b].num)
      .map((k) => `<span data-regime="${k}"><i class="sq" style="background:var(--regime-color)"></i>${REGIMES[k].num} ${esc(REGIMES[k].name)}</span>`),
  ];
  $('legend').innerHTML = items.join('');
}

// ---------- 控制項 ----------

function setupLookback() {
  const seg = $('lookback');
  seg.innerHTML = LOOKBACKS.map(
    (n) => `<button type="button" role="radio" data-n="${n}" aria-checked="${n === state.lookback}">${n} 日</button>`,
  ).join('');
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-n]');
    if (!b) return;
    state.lookback = Number(b.dataset.n);
    setItem('lookback', String(state.lookback));
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    if (state.data) render();
  });
}

function toast(msg, { error = false, link = null, ms = 6000 } = {}) {
  const t = $('toast');
  t.className = `toast${error ? ' error' : ''}`;
  t.innerHTML = esc(msg) + (link ? ` <a href="${esc(link)}" target="_blank" rel="noopener">查看</a>` : '');
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), ms);
}

function setupRefresh() {
  const btn = $('refresh-btn');
  const label = btn.querySelector('.btn-label');
  btn.addEventListener('click', async () => {
    if (state.busy) return;
    state.busy = true;
    btn.disabled = true;
    btn.classList.add('busy');
    try {
      const r = await manualRefresh({
        onStage: (s) => (label.textContent = s),
        reloadData: () => loadData(),
      });
      toast(r.message, { ms: r.mode === 'reload-only' ? 9000 : 5000 });
    } catch (e) {
      toast(e.message, { error: true, link: e.link, ms: 12000 });
    } finally {
      state.busy = false;
      btn.disabled = false;
      btn.classList.remove('busy');
      label.textContent = '立即更新';
    }
  });
}

function setupSettings() {
  const dlg = $('settings');
  const local = isLocal();
  $('settings-github').hidden = local;
  $('settings-local').hidden = !local;
  $('clear-token').hidden = local;

  $('settings-btn').addEventListener('click', () => {
    const s = getSettings();
    $('set-repo').value = s.repo;
    $('set-branch').value = s.branch;
    $('set-token').value = '';
    $('token-state').textContent = s.token ? '已設定 token（留空表示不變更）。' : '尚未設定 token。';
    dlg.showModal();
  });
  $('clear-token').addEventListener('click', () => {
    clearToken();
    $('token-state').textContent = '已清除 token。';
    toast('已清除 token');
  });
  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'save' || local) return;
    const token = $('set-token').value.trim();
    saveSettings({ repo: $('set-repo').value, branch: $('set-branch').value, token: token || undefined });
    toast('設定已儲存');
  });
}

function setupAutoReload() {
  setInterval(() => {
    if (!document.hidden && !state.busy) loadData({ quiet: true }).catch(() => {});
  }, AUTO_RELOAD_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - state.lastLoad > AUTO_RELOAD_MS && !state.busy) {
      loadData({ quiet: true }).catch(() => {});
    }
  });
  // 系統主題切換時重繪圖表
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => chart?.rerender());
}

setupLookback();
setupRefresh();
setupSettings();
setupAutoReload();
loadData().catch(() => {});
