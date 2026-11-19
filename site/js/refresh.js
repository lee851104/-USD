// 手動更新：本機模式呼叫 /api/refresh；GitHub Pages 模式用使用者的 token 觸發 workflow_dispatch。
import { getItem, setItem } from './store.js';

const WORKFLOW = 'update.yml';
const API = 'https://api.github.com';

export function isLocal(loc = location) {
  const h = loc.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');
}

/** 從 <owner>.github.io/<repo>/ 推得 repo */
export function detectRepo(loc = location) {
  const m = /^([^.]+)\.github\.io$/i.exec(loc.hostname);
  if (!m) return '';
  const seg = loc.pathname.split('/').filter(Boolean)[0];
  return seg && !seg.includes('.') ? `${m[1]}/${seg}` : `${m[1]}/${m[1]}.github.io`;
}

export function getSettings() {
  return {
    repo: getItem('repo') || detectRepo(),
    branch: getItem('branch') || 'main',
    token: getItem('token') || '',
  };
}

export function saveSettings({ repo, branch, token }) {
  setItem('repo', repo?.trim() || null);
  setItem('branch', branch?.trim() || null);
  if (token !== undefined) setItem('token', token?.trim() || null);
}

export function clearToken() {
  setItem('token', null);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class RefreshError extends Error {
  constructor(message, { link, kind } = {}) {
    super(message);
    this.link = link;
    this.kind = kind;
  }
}

async function gh(path, token, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new RefreshError('GitHub token 無效或權限不足（需要此 repo 的 Actions：Read and write）。', { kind: 'auth' });
  }
  if (res.status === 404) {
    throw new RefreshError('找不到 repo 或 workflow，請確認設定中的 repo 名稱與分支。', { kind: 'config' });
  }
  if (!res.ok) throw new RefreshError(`GitHub API 錯誤：HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

/**
 * 執行手動更新。
 * onStage(text) 回報進度；waitForData(sinceIso) 會重新載入資料，回傳新資料的 generatedAt（或 null）。
 * 回傳 { mode: 'local' | 'github' | 'reload-only', message }
 */
export async function manualRefresh({ onStage, reloadData }) {
  if (isLocal()) {
    onStage('本機抓取中…');
    const res = await fetch('/api/refresh', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) throw new RefreshError(`本機抓取失敗：${body.error || `HTTP ${res.status}`}`);
    await reloadData();
    return { mode: 'local', message: '已重新抓取最新資料' };
  }

  const { repo, branch, token } = getSettings();
  if (!token || !repo) {
    await reloadData();
    return {
      mode: 'reload-only',
      message: '已重新載入目前發布的資料。要立即重新抓取，請在 ⚙ 設定填入 GitHub token。',
    };
  }

  const clickedAt = new Date();
  onStage('觸發更新…');
  try {
    await gh(`/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`, token, {
      method: 'POST',
      body: JSON.stringify({ ref: branch }),
    });
  } catch (e) {
    await reloadData().catch(() => {});
    throw e;
  }

  // 找到剛觸發的 run
  onStage('等待執行…');
  let run = null;
  const deadline = Date.now() + 6 * 60000;
  while (Date.now() < deadline) {
    await sleep(5000);
    const list = await gh(`/repos/${repo}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=5`, token);
    const candidate = list?.workflow_runs?.find((r) => Date.parse(r.created_at) >= clickedAt.getTime() - 15000);
    if (candidate) run = candidate;
    if (run) {
      if (run.status === 'completed') break;
      onStage(run.status === 'queued' ? '排隊中…' : '抓取並部署中…');
    }
  }
  if (!run) throw new RefreshError('等不到工作流程開始執行，請稍後再試。', { link: `https://github.com/${repo}/actions` });
  if (run.status !== 'completed') throw new RefreshError('工作流程執行超過 6 分鐘，請到 GitHub 查看。', { link: run.html_url });
  if (run.conclusion !== 'success') throw new RefreshError(`工作流程失敗（${run.conclusion}），網站維持上一版資料。`, { link: run.html_url });

  // 等新資料出現在 Pages 上
  onStage('等待新資料上線…');
  const dataDeadline = Date.now() + 3 * 60000;
  while (Date.now() < dataDeadline) {
    const gen = await reloadData();
    if (gen && Date.parse(gen) >= clickedAt.getTime() - 60000) {
      return { mode: 'github', message: '更新完成，已載入最新資料' };
    }
    await sleep(10000);
  }
  return { mode: 'github', message: '工作流程已完成，但新資料尚未上線（Pages 快取），稍後會自動載入。' };
}
