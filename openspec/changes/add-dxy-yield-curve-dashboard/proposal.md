# Proposal

## Why

LEI（The Market Memo）影片〈決定未來風險資產走向的，其實就這「兩個數字」〉指出：**美元指數（DXY）** 與 **美債利差（10Y − 2Y）** 的方向組合，決定全球流動性環境與風險資產表現。目前要追蹤這兩個數字得分別開 TradingView / 財政部網站手動比對，無法一眼看出「現在處於四種組合中的哪一種」。我們需要一個會自動更新、也能手動按更新的網站，把四個指標（DXY、2Y、10Y、10Y−2Y）視覺化，並直接給出目前的組合判讀。

## What Changes

- 新增資料抓取腳本：每次執行從 Yahoo Finance 抓 DXY（`DX-Y.NYB`）、從美國財政部（Treasury.gov）抓 2Y / 10Y 每日殖利率（FRED 為備援），計算 10Y − 2Y 利差，輸出單一 `data.json`。
- 新增「四象限」判讀邏輯：以可切換的回看期間（20 / 60 / 120 交易日，預設 20）判斷 DXY 走強/走弱、利差走陡/走平，對應影片中的四種組合與其資產表現說明。
- 新增靜態網站（繁體中文）：四個指標卡片、DXY / 利差 / 2Y·10Y 上下對齊的時間序列圖、四象限矩陣（標示目前所在組合）、歷史組合色帶、資料表。
- 新增 GitHub Actions 工作流程：每小時自動抓資料並部署到 GitHub Pages；支援手動觸發。
- 網頁「立即更新」按鈕：在 GitHub Pages 上透過使用者自行提供的 GitHub token 觸發工作流程並等待新資料；本機開發模式下直接呼叫本機伺服器重新抓取。網頁開著時也會定期重新載入資料。

## Capabilities

### New Capabilities
- `market-data-ingestion`: 從外部來源抓取 DXY、2Y、10Y 殖利率，計算利差，對齊日期並輸出資料檔；含來源失敗時的備援與狀態回報。
- `macro-regime-classification`: 依回看期間判斷 DXY 與利差方向，歸類為四種組合，並提供曲線型態（牛陡/熊陡/牛平/熊平）與訊號強弱。
- `indicator-dashboard`: 網站的視覺化呈現：指標卡片、圖表、四象限矩陣、歷史組合色帶、資料新鮮度。
- `data-refresh`: 排程自動更新、手動更新按鈕、網頁端定期重新載入。

### Modified Capabilities
（無，這是全新專案）

## Impact

- 新專案，無既有程式碼受影響。
- 外部相依：Yahoo Finance 非官方 chart API（可能變動）、Treasury.gov 每日殖利率 CSV、FRED CSV（備援）、jsDelivr 上的 ECharts。
- 部署：需要一個**公開**的 GitHub repository 並啟用 GitHub Pages（Source = GitHub Actions）。手動更新按鈕需使用者自建 fine-grained token（僅限此 repo 的 Actions 寫入權限），token 只存在使用者自己的瀏覽器。
- 非投資建議：網站僅呈現影片框架的機械式判讀。
