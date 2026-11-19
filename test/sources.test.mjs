import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseTreasuryCsv, parseFredCsv, parseYahooChart } from '../scripts/lib/sources.mjs';

test('parseCsv 處理引號欄位', () => {
  const rows = parseCsv('Date,"2 Yr","10 Yr"\n11/18/2026,4.80,5.07\n');
  assert.deepEqual(rows, [{ Date: '11/18/2026', '2 Yr': '4.80', '10 Yr': '5.07' }]);
});

test('parseTreasuryCsv 轉成 ISO 日期與數值', () => {
  const csv = 'Date,"1 Mo","2 Yr","3 Yr","10 Yr"\n11/18/2026,4.10,4.80,4.84,5.07\n11/17/2026,4.09,4.80,4.84,N/A\n';
  const m = parseTreasuryCsv(csv);
  assert.deepEqual(m.get('2026-11-18'), { y2: 4.8, y10: 5.07 });
  assert.deepEqual(m.get('2026-11-17'), { y2: 4.8, y10: null });
});

test('parseTreasuryCsv 欄位不符時丟出錯誤', () => {
  assert.throws(() => parseTreasuryCsv('<html>error</html>'), /格式不符/);
});

test('parseFredCsv 支援新舊日期欄名與缺值', () => {
  const a = parseFredCsv('observation_date,DGS10\n2026-11-17,5.10\n2026-11-18,\n', 'DGS10');
  assert.equal(a.get('2026-11-17'), 5.1);
  assert.equal(a.get('2026-11-18'), null);
  const b = parseFredCsv('DATE,DGS2\n2020-01-01,.\n', 'DGS2');
  assert.equal(b.get('2020-01-01'), null);
});

test('parseYahooChart 以交易所時區換算日期、略過 null、同日只取第一筆', () => {
  const json = {
    chart: {
      result: [
        {
          meta: { gmtoffset: -18000, regularMarketPrice: 103.94, regularMarketTime: 1795057280 },
          timestamp: [1794891600, 1794978000, 1794718800, 1795057210],
          indicators: { quote: [{ close: [103.49, 103.86, null, 103.925] }] },
        },
      ],
      error: null,
    },
  };
  const { points, quote } = parseYahooChart(JSON.stringify(json));
  assert.equal(points.get('2026-11-17'), 103.49);
  assert.equal(points.get('2026-11-18'), 103.86); // 盤中 K 棒（落在 11-18 晚上）不覆寫收盤
  assert.equal(points.has('2026-11-15'), false);
  assert.equal(quote.price, 103.94);
  assert.equal(quote.time, '2026-11-19T03:01:20.000Z');
});

test('parseYahooChart 夏令時間的 K 棒日期正確（不會落到前一天）', () => {
  const t = (y, m, d, h) => Date.UTC(y, m - 1, d, h) / 1000;
  const json = {
    chart: {
      result: [
        {
          // meta.gmtoffset 是「現在」（冬令）的偏移，但 K 棒在夏令時間是 04:00 UTC
          meta: { gmtoffset: -18000, exchangeTimezoneName: 'America/New_York' },
          timestamp: [t(2026, 6, 11, 4), t(2026, 6, 12, 4), t(2026, 11, 18, 5)],
          indicators: { quote: [{ close: [98.1, 98.2, 103.86] }] },
        },
      ],
    },
  };
  const { points } = parseYahooChart(JSON.stringify(json));
  assert.deepEqual([...points.keys()], ['2026-06-11', '2026-06-12', '2026-11-18']);
  assert.equal(points.get('2026-06-12'), 98.2);
});

test('parseYahooChart 回傳錯誤時丟出例外', () => {
  const json = { chart: { result: null, error: { code: 'Not Found', description: 'No data found' } } };
  assert.throws(() => parseYahooChart(JSON.stringify(json)), /No data found/);
});
