# Tasks

## 1. 專案骨架

- [x] 1.1 建立 `package.json`（type: module，scripts: fetch / test / serve）、`.gitignore`、`site/`、`scripts/`、`test/` 目錄，並確認 `npm run` 列出三個指令

## 2. 判讀邏輯（macro-regime-classification）

- [x] 2.1 實作 `site/js/regimes.js`：四種組合的名稱、驅動主因、資產表現常數（照影片表格），並確認可被 Node import
- [x] 2.2 實作 `site/js/regime.js`：`classify(rows, lookback)`、曲線型態、訊號偏弱判斷，並以 `test/regime.test.mjs` 覆蓋 spec 所有 scenario，`npm test` 全數通過

## 3. 資料抓取（market-data-ingestion）

- [x] 3.1 實作 `scripts/lib/sources.mjs`：Yahoo DXY、Treasury 逐年 CSV、FRED 備援解析器（含逾時與重試），以 `test/sources.test.mjs` 用固定樣本測試 CSV/JSON 解析，`npm test` 通過
- [x] 3.2 實作 `scripts/fetch-data.mjs`：合併序列、計算利差、沿用上一版資料（`PREV_DATA_URL`）、寫出 `site/data/data.json`、全部失敗時非零結束；執行 `npm run fetch` 確認產出檔案且最新日期為最近交易日
- [x] 3.3 以 `test/merge.test.mjs` 測試合併、排序去重、stale 沿用與全部失敗情境，`npm test` 通過

## 4. 網站（indicator-dashboard）

- [x] 4.1 實作 `site/index.html` + `site/css/styles.css`：版面、淺/深色主題、手機版排列；在 375px 寬度確認無水平捲動
- [x] 4.2 實作 `site/js/app.js`：載入資料、四張指標卡（含走勢小圖）、目前組合橫幅與 2×2 矩陣、回看期間切換並記住選擇；在瀏覽器確認數值與 data.json 一致
- [x] 4.3 實作圖表：DXY / 利差 / 2Y·10Y / 組合色帶上下對齊（無雙 Y 軸）、縮放與十字游標連動、預設最近 2 年，加上最近 30 日資料表；在瀏覽器確認縮放同步
- [x] 4.4 新鮮度與來源狀態列、stale/fallback 警示、頁尾來源與免責聲明；以手改 data.json 狀態為 `stale` 確認警示出現

## 5. 更新機制（data-refresh）

- [x] 5.1 實作 `scripts/serve.mjs`：靜態檔伺服器 + `POST /api/refresh`；在本機按「立即更新」確認 `generatedAt` 變新
- [ ] 5.2 前端每 10 分鐘以 `?t=` 重新載入資料並就地更新；以縮短間隔的方式在瀏覽器確認會重新請求（程式已完成，尚未在瀏覽器實測定時觸發）
- [x] 5.3 GitHub 模式手動更新：設定對話框（repo、token、清除 token）、workflow_dispatch、輪詢 run、等待新 `generatedAt`；未設 token / 401 時的訊息以 `test/refresh.test.mjs` 驗證（實際 GitHub 觸發待部署後確認）
- [x] 5.4 建立 `.github/workflows/update.yml`（cron 每小時、workflow_dispatch、push；fetch → test → deploy pages；`PREV_DATA_URL` 取自 configure-pages），並確認 YAML 語法正確

## 6. 文件與整合驗證

- [x] 6.1 撰寫 `README.md`（繁中）：本機執行、部署到 GitHub Pages、建立 fine-grained token、排程停用時如何重新啟用；確認文件中的指令可照做執行
- [x] 6.2 整合驗證：`npm test` 全過、`openspec validate add-dxy-yield-curve-dashboard --strict` 通過、本機網站完整走一遍（切換期間、縮放、立即更新、手機寬度、深色模式）

## Workflow follow-up

- 使用者建立 GitHub repo 並 push 後，確認首次 Actions 部署成功、Pages 網址可開啟。
- 部署驗證完成後執行 `openspec archive add-dxy-yield-curve-dashboard`。
