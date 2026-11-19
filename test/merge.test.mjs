import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, buildDataset } from '../scripts/lib/dataset.mjs';

const dxyPoints = new Map([
  ['2026-11-18', 103.86],
  ['2026-11-17', 103.49],
  ['2026-11-19', 103.9],
]);
const yields = new Map([
  ['2026-11-17', { y2: 4.8, y10: 5.1 }],
  ['2026-11-18', { y2: 4.8, y10: 5.07 }],
]);
const ok = {
  dxy: async () => ({ points: dxyPoints, quote: { price: 103.94, time: '2026-11-19T03:00:00.000Z' } }),
  treasury: async () => yields,
  fred: async () => {
    throw new Error('should not be called');
  },
};
const fail = (msg) => async () => {
  throw new Error(msg);
};
const now = new Date('2026-11-19T03:17:00Z');

test('buildRows：排序、去重、計算利差並四捨五入', () => {
  const rows = buildRows(dxyPoints, yields);
  assert.deepEqual(rows, [
    ['2026-11-17', 103.49, 4.8, 5.1, 0.3],
    ['2026-11-18', 103.86, 4.8, 5.07, 0.27],
    ['2026-11-19', 103.9, null, null, null],
  ]);
});

test('buildRows：略過起始日之前的資料', () => {
  assert.equal(buildRows(dxyPoints, yields, '2026-11-18').length, 2);
});

test('所有來源成功：狀態 ok、含中繼資訊', async () => {
  const r = await buildDataset({ fetchers: ok, now });
  assert.equal(r.ok, true);
  assert.equal(r.data.generatedAt, '2026-11-19T03:17:00Z');
  assert.equal(r.data.sources.dxy.status, 'ok');
  assert.equal(r.data.sources.dxy.lastDate, '2026-11-19');
  assert.equal(r.data.sources.treasury.status, 'ok');
  assert.equal(r.data.sources.treasury.lastDate, '2026-11-18');
  assert.equal(r.data.dxyQuote.price, 103.94);
  assert.equal(r.data.rows.length, 3);
});

test('財政部失敗 → 改用 FRED，狀態 fallback', async () => {
  const r = await buildDataset({ fetchers: { ...ok, treasury: fail('逾時'), fred: async () => yields }, now });
  assert.equal(r.ok, true);
  assert.equal(r.data.sources.treasury.status, 'fallback');
  assert.match(r.data.sources.treasury.error, /逾時/);
});

test('DXY 失敗但有上一版 → 沿用舊資料，狀態 stale', async () => {
  const prev = { rows: [['2026-11-10', 101, 4.7, 5.0, 0.3]], dxyQuote: { price: 101, time: 'x' } };
  const r = await buildDataset({ fetchers: { ...ok, dxy: fail('HTTP 429') }, prev, now });
  assert.equal(r.ok, true);
  assert.equal(r.data.sources.dxy.status, 'stale');
  assert.match(r.data.sources.dxy.error, /429/);
  assert.equal(r.data.rows.find((x) => x[0] === '2026-11-10')[1], 101);
  assert.equal(r.data.rows.find((x) => x[0] === '2026-11-18')[4], 0.27);
});

test('殖利率全部失敗但有上一版 → stale', async () => {
  const prev = { rows: [['2026-11-18', 103, 4.8, 5.07, 0.27]] };
  const r = await buildDataset({ fetchers: { ...ok, treasury: fail('a'), fred: fail('b') }, prev, now });
  assert.equal(r.ok, true);
  assert.equal(r.data.sources.treasury.status, 'stale');
});

test('全部失敗且沒有上一版 → ok:false', async () => {
  const r = await buildDataset({ fetchers: { dxy: fail('x'), treasury: fail('y'), fred: fail('z') }, now });
  assert.equal(r.ok, false);
  assert.match(r.error, /沒有上一版/);
});
