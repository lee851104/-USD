import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, curveShape, regimeKey, isWeak, regimeSegments, completeRows } from '../site/js/regime.js';
import { REGIMES, MATRIX_ORDER } from '../site/js/regimes.js';

// 產生 n 天資料的小工具
function series(points) {
  return points.map(([dxy, y2, y10], i) => {
    const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    return [d, dxy, y2, y10, Math.round((y10 - y2) * 100) / 100];
  });
}

test('四種組合都有說明，且矩陣包含全部四種', () => {
  assert.deepEqual(Object.keys(REGIMES).sort(), ['down-down', 'down-up', 'up-down', 'up-up']);
  assert.deepEqual([...MATRIX_ORDER].sort(), Object.keys(REGIMES).sort());
});

test('美元升、利差降 → 流動性最緊縮', () => {
  assert.equal(REGIMES[regimeKey(1.2, -0.15)].name, '流動性最緊縮');
});

test('美元降、利差升 → 流動性釋放初期', () => {
  assert.equal(REGIMES[regimeKey(-0.8, 0.1)].name, '流動性釋放初期');
});

test('美元升、利差升 → 結構性分化；美元降、利差降 → 避險主導', () => {
  assert.equal(REGIMES[regimeKey(0.5, 0.2)].name, '結構性分化');
  assert.equal(REGIMES[regimeKey(-0.5, -0.2)].name, '避險主導');
});

test('曲線型態', () => {
  assert.equal(curveShape(0.3, 0.1), '熊平');
  assert.equal(curveShape(0.1, 0.3), '熊陡');
  assert.equal(curveShape(-0.3, -0.1), '牛陡');
  assert.equal(curveShape(-0.1, -0.3), '牛平');
  assert.equal(curveShape(-0.1, 0.05), '扭轉陡峭');
  assert.equal(curveShape(0.1, -0.05), '扭轉平坦');
  assert.equal(curveShape(0, 0), '持平');
});

test('訊號偏弱：DXY 100.00 → 100.20（0.2%）', () => {
  assert.equal(isWeak(0.2, 100, 0.2), true);
  assert.equal(isWeak(1.0, 100, 0.2), false);
  assert.equal(isWeak(1.0, 100, 0.04), true);
});

test('classify：資料不足的日期不給組合，之後依回看期間判斷', () => {
  const rows = series([
    [100, 4.0, 4.5],
    [101, 4.1, 4.55],
    [102, 4.3, 4.6],
  ]);
  const r1 = classify(rows, 2);
  assert.equal(r1.length, 3);
  assert.equal(r1[0].regime, null);
  assert.equal(r1[1].regime, null);
  assert.equal(r1[2].regime, 'up-down');
  assert.equal(r1[2].dDxy, 2);
  assert.equal(r1[2].dSpread, -0.2);
  assert.equal(r1[2].curveShape, '熊平');
  assert.equal(r1[2].weak, false);
  assert.equal(r1[2].prevDate, rows[0][0]);
});

test('classify：切換回看期間會重新計算', () => {
  const rows = series([
    [100, 4.0, 4.5],
    [103, 4.0, 4.5],
    [102, 3.9, 4.6],
  ]);
  assert.equal(classify(rows, 1)[2].regime, 'down-up');
  assert.equal(classify(rows, 2)[2].regime, 'up-up');
});

test('classify：缺值的列會被略過，不算進交易日', () => {
  const rows = series([
    [100, 4.0, 4.5],
    [101, 4.0, 4.5],
    [102, 4.0, 4.5],
  ]);
  rows.splice(1, 0, ['2026-01-01x', null, 4.0, 4.5, 0.5]);
  assert.equal(completeRows(rows).length, 3);
  const r = classify(rows, 2);
  assert.equal(r.length, 3);
  assert.equal(r[2].dDxy, 2);
});

test('classify：回看期間必須為正整數', () => {
  assert.throws(() => classify([], 0));
});

test('regimeSegments 合併連續相同組合', () => {
  const segs = regimeSegments([
    { date: 'a', regime: null },
    { date: 'b', regime: 'up-up' },
    { date: 'c', regime: 'up-up' },
    { date: 'd', regime: 'down-down' },
  ]);
  assert.deepEqual(segs, [
    { start: 'b', end: 'c', regime: 'up-up' },
    { start: 'd', end: 'd', regime: 'down-down' },
  ]);
});
