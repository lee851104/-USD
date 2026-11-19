# 美元 × 利差 四象限

追蹤影片〈[決定未來風險資產走向的，其實就這「兩個數字」](https://youtu.be/Y8V3LJn4uhE)〉（LEI / The Market Memo）提到的兩個數字——**美元指數 DXY** 與 **美債利差 10Y − 2Y**——並把四個指標（DXY、2Y、10Y、10Y−2Y）視覺化，自動判讀目前落在四種組合的哪一種：

| | 曲線走陡（利差↑） | 曲線走平（利差↓） |
|---|---|---|
| **美元走強** | ② 結構性分化 | ① 流動性最緊縮 |
| **美元走弱** | ③ 流動性釋放初期 | ④ 避險主導 |

判讀規則：回看 N 個交易日（20 / 60 / 120，網頁上切換），ΔDXY > 0 為走強、Δ利差 > 0 為走陡；|ΔDXY| < 0.5% 或 |Δ利差| < 0.05 個百分點標示「訊號偏弱」。

> 本專案非投資建議。

## 資料來源

| 指標 | 主要來源 | 備援 |
|---|---|---|
| DXY | Yahoo Finance `DX-Y.NYB`（ICE 美元指數） | 沿用上一版資料 |
| 2Y / 10Y | 美國財政部 Daily Treasury Par Yield Curve | FRED `DGS2` / `DGS10` → 沿用上一版 |

利差自行以 10Y − 2Y 計算。

## 本機執行

需要 Node.js 20 以上，沒有任何 npm 相依套件。（若 PowerShell 擋下 `npm` 指令，直接用 `node` 執行即可。）

```powershell
node scripts/fetch-data.mjs
```

```powershell
node scripts/serve.mjs
```

打開 <http://localhost:5173/>（簡潔版首頁）或 <http://localhost:5173/full.html>（完整版）。本機模式下「↻ 更新」會直接讓本機伺服器重新抓資料。

```powershell
node --test "test/**/*.test.mjs"
```

## 部署到 GitHub Pages（每小時自動更新）

1. 在 GitHub 建立一個 **公開** repository（免費方案的 Pages 需要公開 repo）。
2. 先到 repo → **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**（沒先開啟的話第一次部署會失敗，開啟後到 Actions 重跑即可）。
3. 把這個資料夾 push 上去（分支 `main`）。push 後 `.github/workflows/update.yml` 會自動執行：測試 → 抓資料 → 部署。之後每小時第 17 分（UTC）自動更新一次。
4. 網址為 `https://<你的帳號>.github.io/<repo 名稱>/`。

### 讓網頁上的「立即更新」按鈕能觸發更新

沒有 token 時，按鈕只會重新載入目前已發布的資料（排程每小時仍會更新）。要讓按鈕立即觸發重新抓取：

1. 到 <https://github.com/settings/personal-access-tokens/new> 建立 **fine-grained token**：
   - Repository access：**Only select repositories** → 選這個 repo
   - Permissions → Repository permissions → **Actions：Read and write**（其他都不用）
   - 設定到期日
2. 打開完整版 `full.html`，在右上角 ⚙ 設定貼上 token，按儲存（token 存在瀏覽器，首頁的「↻ 更新」也會使用）。

token 只存在那台裝置的瀏覽器（localStorage），只會送到 `api.github.com`；可隨時在設定裡「清除 token」。按下後約 1–3 分鐘完成（觸發 → 執行 → 部署 → 載入新資料）。

### 注意事項

- **GitHub 會在 repo 60 天沒有活動後自動停用排程。** 網頁在資料超過 6 小時未更新時會顯示提示；到 repo 的 **Actions → Update data & deploy → Enable workflow** 重新啟用即可。
- GitHub 的排程可能延遲幾分鐘到數十分鐘，屬正常現象。
- Yahoo Finance 是非官方 API，若失效網頁會顯示「DXY 來源暫時失敗，顯示的是先前的資料」。
- 美債殖利率為每日資料，美國收盤後（約台灣時間早上）才會出現當天數值。

## 專案結構

```
site/                 靜態網站（GitHub Pages 發布這個資料夾）
  index.html          簡潔版首頁（四象限 + 軌跡動畫 + 兩個數字，點開看走勢）
  full.html           完整版（多圖、資料表）
  css/styles.css      完整版樣式
  js/app.js           完整版畫面
  js/chart.js         完整版 ECharts 小圖組
  js/regime.js        四象限判讀（Node 與瀏覽器共用）
  js/regimes.js       四種組合的說明文字
  js/refresh.js       手動更新
  data/data.json      由 fetch-data 產生（不進版控）
scripts/
  fetch-data.mjs      抓資料 → site/data/data.json
  serve.mjs           本機伺服器 + POST /api/refresh
  lib/                來源解析與合併
test/                 node --test
openspec/             規格（proposal / specs / design / tasks）
.github/workflows/update.yml
```
