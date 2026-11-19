// 上下對齊的小圖組：DXY / 利差 / 2Y·10Y / 組合色帶。每張圖只有一個 Y 軸。
import { REGIMES } from './regimes.js';
import { regimeSegments } from './regime.js';
import { dateTs, fmt, esc } from './format.js';

const DAY = 86400000;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function palette() {
  return {
    ink: cssVar('--ink'),
    ink2: cssVar('--ink-2'),
    muted: cssVar('--muted'),
    grid: cssVar('--grid'),
    axis: cssVar('--axis'),
    surface: cssVar('--surface'),
    s1: cssVar('--s1'),
    s2: cssVar('--s2'),
    regime: {
      'up-down': [cssVar('--r1'), cssVar('--r-ink-1')],
      'up-up': [cssVar('--r2'), cssVar('--r-ink-2')],
      'down-up': [cssVar('--r3'), cssVar('--r-ink-3')],
      'down-down': [cssVar('--r4'), cssVar('--r-ink-4')],
    },
  };
}

export function createChart(el) {
  /* global echarts */
  const chart = echarts.init(el, null, { renderer: 'canvas' });
  let last = null;

  function currentZoom() {
    const dz = chart.getOption()?.dataZoom?.[0];
    if (!dz || dz.startValue == null) return null;
    return [dz.startValue, dz.endValue];
  }

  function render(rows, results, { keepZoom = true } = {}) {
    const zoom = keepZoom && last ? currentZoom() : null;
    last = { rows, results };
    chart.setOption(buildOption(rows, results, chart.getHeight(), palette(), zoom), { notMerge: true });
  }

  const ro = new ResizeObserver(() => {
    chart.resize();
    if (last) render(last.rows, last.results);
  });
  ro.observe(el);

  return {
    render,
    rerender: () => last && render(last.rows, last.results),
  };
}

function buildOption(rows, results, H, c, zoom) {
  const dxy = [];
  const y2 = [];
  const y10 = [];
  const spread = [];
  const byTs = new Map();
  for (const r of rows) {
    const t = dateTs(r[0]);
    byTs.set(t, { row: r });
    if (r[1] != null) dxy.push([t, r[1]]);
    if (r[2] != null) y2.push([t, r[2]]);
    if (r[3] != null) y10.push([t, r[3]]);
    if (r[4] != null) spread.push([t, r[4]]);
  }
  for (const res of results) {
    const e = byTs.get(dateTs(res.date));
    if (e) e.res = res;
  }
  const segs = regimeSegments(results).map((s) => [dateTs(s.start), dateTs(s.end) + DAY, s.regime]);

  const lastTs = dateTs(rows[rows.length - 1][0]);
  const firstTs = dateTs(rows[0][0]);
  const [zs, ze] = zoom ?? [Math.max(firstTs, lastTs - 730 * DAY), lastTs + DAY];

  // 版面（px）
  const titleH = 24;
  const gap = 18;
  const bandH = 26;
  const xLabelH = 26;
  const sliderH = 26;
  const avail = Math.max(240, H - titleH * 4 - gap * 3 - bandH - xLabelH - sliderH - 16);
  const h = [avail * 0.34, avail * 0.28, avail * 0.38];
  const tops = [];
  let y = titleH;
  for (let i = 0; i < 3; i++) {
    tops.push(y);
    y += h[i] + gap + titleH;
  }
  tops.push(y);
  const left = 56;
  const right = 52;

  const titles = ['DXY 美元指數', '10Y − 2Y 利差（百分點）', '2Y / 10Y 殖利率（%）', '每日組合'];
  const grids = [0, 1, 2, 3].map((i) => ({ left, right, top: tops[i], height: i === 3 ? bandH : h[i], containLabel: false }));

  const axisCommon = {
    axisLine: { lineStyle: { color: c.axis } },
    axisTick: { show: false },
    axisLabel: { color: c.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: c.grid, width: 1 } },
  };

  const xAxis = grids.map((_, i) => ({
    type: 'time',
    gridIndex: i,
    min: 'dataMin',
    max: 'dataMax',
    ...axisCommon,
    splitLine: { show: false },
    axisLabel: { ...axisCommon.axisLabel, show: i === 3, hideOverlap: true },
    axisLine: { show: i !== 3, lineStyle: { color: c.axis } },
    axisPointer: { label: { show: i === 3 } },
  }));

  const yAxis = [
    { type: 'value', gridIndex: 0, scale: true, ...axisCommon, splitNumber: 4 },
    { type: 'value', gridIndex: 1, scale: true, ...axisCommon, splitNumber: 4, axisLabel: { ...axisCommon.axisLabel, formatter: (v) => fmt(v, 1) } },
    { type: 'value', gridIndex: 2, scale: true, ...axisCommon, splitNumber: 4, axisLabel: { ...axisCommon.axisLabel, formatter: (v) => fmt(v, 1) } },
    { type: 'value', gridIndex: 3, min: 0, max: 1, show: false },
  ];

  const line = (name, data, color, xi, extra = {}) => ({
    name,
    type: 'line',
    xAxisIndex: xi,
    yAxisIndex: xi,
    data,
    showSymbol: false,
    symbolSize: 8,
    sampling: 'lttb',
    lineStyle: { width: 2, color },
    itemStyle: { color, borderColor: c.surface, borderWidth: 2 },
    emphasis: { disabled: true },
    ...extra,
  });

  // 直接標示線名；文字用中性色，線條顏色負責辨識
  const endLabel = (text) => ({
    show: true,
    formatter: () => text,
    color: c.ink2,
    fontSize: 12,
    distance: 6,
    textBorderColor: c.surface,
    textBorderWidth: 3,
  });

  const series = [
    line('DXY', dxy, c.s1, 0),
    line('10Y−2Y', spread, c.s1, 1, {
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: c.muted, width: 1, type: 'solid' },
        label: { formatter: '0（倒掛線）', color: c.muted, fontSize: 11, position: 'insideEndBottom' },
        data: [{ yAxis: 0 }],
      },
    }),
    line('2Y', y2, c.s1, 2, { endLabel: endLabel('2Y') }),
    line('10Y', y10, c.s2, 2, { endLabel: endLabel('10Y') }),
    {
      name: '組合',
      type: 'custom',
      xAxisIndex: 3,
      yAxisIndex: 3,
      data: segs,
      encode: { x: [0, 1] },
      clip: true,
      renderItem(params, api) {
        const start = api.coord([api.value(0), 1]);
        const end = api.coord([api.value(1), 0]);
        const key = segs[params.dataIndex][2];
        const [fill, ink] = c.regime[key];
        const w = Math.max(0, end[0] - start[0] - 1);
        const rect = echarts.graphic.clipRectByRect(
          { x: start[0], y: start[1], width: w, height: end[1] - start[1] },
          { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height },
        );
        if (!rect) return null;
        const children = [{ type: 'rect', shape: rect, style: { fill } }];
        if (rect.width >= 18) {
          children.push({
            type: 'text',
            style: {
              text: String(REGIMES[key].num),
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              align: 'center',
              verticalAlign: 'middle',
              fill: ink,
              fontSize: 12,
              fontWeight: 700,
            },
          });
        }
        return { type: 'group', children };
      },
    },
  ];

  return {
    animation: false,
    textStyle: { fontFamily: getComputedStyle(document.body).fontFamily },
    title: titles.map((text, i) => ({
      text,
      left: left - 4,
      top: tops[i] - titleH + 2,
      textStyle: { fontSize: 13, fontWeight: 600, color: c.ink2 },
    })),
    grid: grids,
    xAxis,
    yAxis,
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      lineStyle: { color: c.muted, width: 1 },
      label: { backgroundColor: c.ink, color: c.surface },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      backgroundColor: c.surface,
      borderColor: c.axis,
      textStyle: { color: c.ink, fontSize: 13 },
      confine: true,
      formatter(params) {
        const p = Array.isArray(params) ? params[0] : params;
        if (!p) return '';
        let t = Array.isArray(p.value) ? p.value[0] : p.axisValue;
        // 色帶區段 → 找最近的日期
        if (p.seriesName === '組合') t = p.axisValue;
        const day = Math.floor(t / DAY) * DAY;
        const e = byTs.get(day);
        if (!e) return '';
        const [d, x, a, b, s] = e.row;
        const dot = (col) => `<span style="display:inline-block;width:10px;height:3px;border-radius:2px;background:${col};margin-right:6px;vertical-align:middle"></span>`;
        let html = `<b>${esc(d)}</b><br/>`;
        html += `${dot(c.s1)}DXY　<b>${fmt(x, 2)}</b><br/>`;
        html += `${dot(c.s1)}利差　<b>${fmt(s, 2)}</b><br/>`;
        html += `${dot(c.s1)}2Y　<b>${fmt(a, 2)}%</b><br/>`;
        html += `${dot(c.s2)}10Y　<b>${fmt(b, 2)}%</b>`;
        if (e.res?.regime) {
          const R = REGIMES[e.res.regime];
          const [fill] = c.regime[e.res.regime];
          html += `<br/><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${fill};margin-right:6px;vertical-align:-1px"></span>${R.num} ${esc(R.name)}${e.res.weak ? '（訊號偏弱）' : ''}`;
        }
        return html;
      },
    },
    dataZoom: [
      { type: 'slider', xAxisIndex: [0, 1, 2, 3], startValue: zs, endValue: ze, bottom: 6, height: sliderH, left, right,
        borderColor: c.grid, fillerColor: 'rgba(128,128,128,0.12)', dataBackground: { lineStyle: { color: c.axis }, areaStyle: { color: c.grid } },
        textStyle: { color: c.muted }, labelFormatter: (v) => new Date(v).toISOString().slice(0, 10), brushSelect: false },
      { type: 'inside', xAxisIndex: [0, 1, 2, 3], startValue: zs, endValue: ze, zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false, moveOnMouseMove: true },
    ],
    series,
  };
}
