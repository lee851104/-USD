# Design

## Context

全新專案（`D:\$USD`），沒有既有程式碼。動機見 proposal.md。限制條件：

- 部署在 **GitHub Pages**（純靜態），更新靠 **GitHub Actions**；沒有常駐後端。
- 瀏覽器無法直接呼叫 Yahoo / Treasury / FRED（沒有 CORS），所以抓資料只能在 Actions（或本機 Node）裡做。
- 開發機有 Node 24、Python 3.12；沒有安裝 `gh` CLI。
- 實測（2026-11-19）：Yahoo chart API 與 Treasury.gov CSV 可從本機存取；FRED `fredgraph.csv` 在本機逾時（GitHub Actions 上可能正常，所以只當備援）。

## Goals / Non-Goals

**Goals:**
- 零建置步驟、零 npm 執行期相依：Node 原生 `fetch` + 原生 ES modules。
- 判讀邏輯只寫一份，Node（測試、預先計算）與瀏覽器共用。
- 單一資料檔，前端可完全離線於資料來源運作。

**Non-Goals:**
- 不做盤中即時串流；DXY 只附帶「最新報價」，殖利率為每日資料。
- 不做帳號系統、通知推播、回測績效。
- 不保證 Yahoo 非官方 API 長期可用（有備援提示，但不另找付費來源）。

## Decisions

### 1. 架構：Actions 產生資料 → Pages 發布靜態站

```
GitHub Actions (cron 每小時 / workflow_dispatch / push)
  └─ node scripts/fetch-data.mjs ──► site/data/data.json
  └─ node --test                 （判讀邏輯測試）
  └─ upload-pages-artifact(site/) ─► deploy-pages
瀏覽器
  └─ index.html + js/app.js ──fetch──► data/data.json（每 10 分鐘，?t= 破快取）
  └─ 「立即更新」──► GitHub API workflow_dispatch（使用者 token）──► 輪詢 run 狀態 ──► 重新載入
本機
  └─ node scripts/serve.mjs ──► 靜態檔 + POST /api/refresh（執行 fetch-data）
```

**為什麼不 commit 資料回 repo**：每小時一次 commit 會讓歷史暴增；每次執行都會重新抓完整歷史（5–10 年），資料是「無狀態」的，直接用 Pages artifact 部署即可。
**替代方案**：Vercel/Cloudflare serverless 可做真正即時的手動更新、不需 token，但使用者選了 GitHub Pages。

### 2. 資料來源

| 指標 | 主要 | 備援 |
|---|---|---|
| DXY | Yahoo `query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=10y&interval=1d`（失敗改 `query2`） | 上一版已發布的 `data.json` |
| 2Y / 10Y | Treasury.gov `daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve`，逐年抓近 10 年 | FRED `fredgraph.csv?id=DGS2/DGS10` → 上一版 `data.json` |

- 利差自行以 `10Y − 2Y` 計算（不抓 FRED `T10Y2Y`），確保與 2Y/10Y 同源同日。
- 「上一版資料」從 Pages 網址 `${PAGES_URL}/data/data.json` 取得（workflow 由 `actions/configure-pages` 的 `base_url` 提供）。
- 所有請求帶逾時（20 秒）與一次重試。

### 3. 資料檔格式（`site/data/data.json`）

```json
{
  "generatedAt": "2026-11-19T03:17:00Z",
  "sources": {
    "dxy":      { "name": "Yahoo Finance DX-Y.NYB", "status": "ok", "lastDate": "2026-11-18", "error": null },
    "treasury": { "name": "U.S. Treasury", "status": "ok", "lastDate": "2026-11-18", "error": null }
  },
  "dxyQuote": { "price": 103.9, "time": "2026-11-19T02:55:31Z" },
  "rows": [ ["2026-11-18", 103.41, 4.80, 5.07, 0.27], ... ]
}
```

`rows` 欄位依序為 `date, dxy, y2, y10, spread`，以陣列而非物件省空間（10 年約 2,500 列 ≈ 100 KB）。缺值為 `null`。日期為兩來源的聯集；判讀時只用兩者都有值的日期。

### 4. 判讀邏輯（`site/js/regime.js`，純函式）

- `classify(rows, lookback)` 回傳每日 `{ regime, curveShape, weak, dDxy, dDxyPct, dSpread, d2y, d10y }`。
- 「N 個交易日」以兩序列皆有值的列計算位移，避免假日錯位。
- 四種組合文字（驅動主因、資產表現）照影片表格整理成常數，放在 `site/js/regimes.js`。
- 測試：`node --test test/`，以手寫小序列覆蓋 spec 中每個 scenario。

### 5. 前端

- 原生 HTML/CSS/JS（ES modules），圖表用 **ECharts 5.5.1**（jsDelivr，固定版本）：單一實例內多個 grid 共用時間軸、`dataZoom` 與 `axisPointer` 連動、`custom` series 畫色帶。
  替代方案：Chart.js（多圖連動麻煩）、Lightweight Charts（不擅長分類色帶）。
- **不用雙 Y 軸**：影片把 DXY 與利差疊在同一張圖，但兩個刻度的對齊是任意的，會製造假的相關性。改成上下對齊的小圖組（DXY / 利差 / 2Y+10Y / 色帶），共用 X 軸與十字游標，一樣能看出同步關係。
- 顏色：指標線用參考色盤 slot 1–2；四種組合用紅（緊縮）/黃（分化）/青（釋放）/藍（避險），已用 dataviz 驗證工具在淺/深色模式 all-pairs 通過（CVD 落在 6–8 警示帶，所以色帶內加 ①–④ 編號、圖例與表格作為第二編碼）。
- 版面：頂列（標題、回看期間切換 20/60/120、立即更新、設定齒輪、新鮮度）→ 目前組合橫幅 + 2×2 矩陣 → 四張指標卡 → 小圖組 → 資料表 → 頁尾。
- 淺/深色主題以 CSS 變數 + `prefers-color-scheme`；ECharts 依主題重繪。
- 回看期間與 token 存 `localStorage`（try/catch 包住）。

### 5b. 介面簡化（2026-11-19 使用者回饋）

使用者認為多圖版面太複雜，首頁改為極簡版（`site/index.html`，原完整版保留為 `site/full.html`）：

- 只呈現三件事：四象限位置圖（含近 3 個月每週軌跡動畫）、目前情境的白話說明與資產標籤、兩個關鍵數字。
- 點格子切換查看其他情境；點數字開啟單一指標走勢（3 個月 / 1 年 / 5 年）。
- 圖表改用手寫 SVG（不載入 ECharts），首頁不依賴任何 CDN。
- 漲跌顏色依使用者要求：上漲綠、下跌紅，並保留 ▲▼ 符號。
- 電腦版一頁呈現（CSS grid + 100vh），手機版直向堆疊、走勢圖為底部面板。

### 6. 手動更新

- **GitHub Pages**：repo 由 `location`（`<owner>.github.io/<repo>/`）推得，可在設定中覆寫。按下後：
  1. `POST /repos/{o}/{r}/actions/workflows/update.yml/dispatches {ref:"main"}`
  2. 每 5 秒輪詢 `GET /actions/runs?event=workflow_dispatch&per_page=1`，直到 `status=completed`（逾時 5 分鐘）
  3. 再等 Pages 生效，重新抓 `data.json?t=`，直到 `generatedAt` 晚於按下時間（最多再等 2 分鐘）
- Token：fine-grained PAT，只授權此 repo、權限 **Actions: Read and write**。只存 localStorage，只送往 `api.github.com`。
- **本機**：`hostname` 為 `localhost`/`127.0.0.1` 時改呼叫 `POST /api/refresh`。

### 7. GitHub Actions 工作流程（`.github/workflows/update.yml`）

- 觸發：`schedule: '17 * * * *'`（避開整點壅塞）、`workflow_dispatch`、`push` 到 `main`。
- `permissions: pages: write, id-token: write, contents: read`；`concurrency: { group: pages, cancel-in-progress: false }`。
- 抓取失敗（非零結束）→ 工作流程失敗、不部署，網站維持上一版。

## Risks / Trade-offs

- [Yahoo 非官方 API 變更或封鎖 Actions IP] → `query1`/`query2` 輪替、沿用上一版資料並在網頁顯示 `stale` 警告。
- [GitHub 排程延遲或在 repo 60 天無活動後自動停用排程] → 網頁顯示資料時間讓使用者察覺；README 說明如何重新啟用。手動按鈕不受影響。
- [Pages CDN 快取約 10 分鐘] → 前端一律加 `?t=` 查詢字串取得資料檔。
- [手動更新需 1–3 分鐘] → 按鈕顯示階段性進度（觸發 → 執行中 → 部署 → 完成）。
- [Token 外洩風險] → 只要求單一 repo 的 Actions 權限；明確提供「清除 token」；不使用 classic PAT。
- [四象限是簡化框架] → 頁面顯示「訊號偏弱」與非投資建議聲明。

## Migration Plan

1. 本機：`npm run fetch` → `npm test` → `npm run serve`，在瀏覽器驗證。
2. 使用者在 GitHub 建立**公開** repo，push 程式碼；Settings → Pages → Source 選 **GitHub Actions**。
3. 首次 push 觸發工作流程並部署（首次沒有上一版資料可沿用，屬預期）。
4. 使用者自建 fine-grained token，在網站設定中貼上即可使用「立即更新」。
回滾：在 Actions 重跑先前成功的 run，或 revert commit。

## Open Questions

- GitHub repo 名稱與帳號：部署步驟時再向使用者確認，不影響程式結構（repo 由網址自動推得）。
