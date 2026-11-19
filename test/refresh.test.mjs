import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 瀏覽器全域物件的最小替身
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.location = new URL('https://someone.github.io/usd-dashboard/');

const { detectRepo, isLocal, manualRefresh, saveSettings, clearToken, getSettings } = await import('../site/js/refresh.js');

beforeEach(() => {
  mem.clear();
  globalThis.location = new URL('https://someone.github.io/usd-dashboard/');
});

test('detectRepo 從 GitHub Pages 網址推得 repo', () => {
  assert.equal(detectRepo(new URL('https://someone.github.io/usd-dashboard/')), 'someone/usd-dashboard');
  assert.equal(detectRepo(new URL('https://someone.github.io/usd-dashboard/index.html')), 'someone/usd-dashboard');
  assert.equal(detectRepo(new URL('https://someone.github.io/')), 'someone/someone.github.io');
  assert.equal(detectRepo(new URL('https://example.com/x/')), '');
});

test('isLocal', () => {
  assert.equal(isLocal(new URL('http://localhost:5173/')), true);
  assert.equal(isLocal(new URL('http://127.0.0.1:5173/')), true);
  assert.equal(isLocal(new URL('https://someone.github.io/a/')), false);
});

test('未設定 token：只重新載入資料，不呼叫 GitHub API', async () => {
  let reloaded = 0;
  globalThis.fetch = async () => {
    throw new Error('不應呼叫 fetch');
  };
  const r = await manualRefresh({ onStage: () => {}, reloadData: async () => (reloaded++, null) });
  assert.equal(r.mode, 'reload-only');
  assert.equal(reloaded, 1);
  assert.match(r.message, /token/);
});

test('token 無效（401）：顯示錯誤並仍重新載入資料', async () => {
  saveSettings({ repo: 'someone/usd-dashboard', branch: 'main', token: 'bad' });
  let reloaded = 0;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([url, init]);
    return new Response(null, { status: 401 });
  };
  await assert.rejects(
    manualRefresh({ onStage: () => {}, reloadData: async () => (reloaded++, null) }),
    /token 無效/,
  );
  assert.equal(reloaded, 1);
  assert.equal(calls[0][0], 'https://api.github.com/repos/someone/usd-dashboard/actions/workflows/update.yml/dispatches');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer bad');
  assert.deepEqual(JSON.parse(calls[0][1].body), { ref: 'main' });
});

test('token 只送往 api.github.com', async () => {
  saveSettings({ repo: 'someone/usd-dashboard', token: 'tok' });
  const hosts = new Set();
  globalThis.fetch = async (url) => {
    hosts.add(new URL(url).host);
    return new Response(null, { status: 401 });
  };
  await assert.rejects(manualRefresh({ onStage: () => {}, reloadData: async () => null }));
  assert.deepEqual([...hosts], ['api.github.com']);
});

test('清除 token', () => {
  saveSettings({ repo: 'a/b', token: 'tok' });
  assert.equal(getSettings().token, 'tok');
  clearToken();
  assert.equal(getSettings().token, '');
  assert.equal(getSettings().repo, 'a/b');
});
