# Spec Delta

## Purpose

讓網站上的資料自動保持新鮮，並讓使用者可以隨時手動觸發更新，不必自己執行任何指令。

## ADDED Requirements

### Requirement: 每小時自動更新
系統 SHALL 每小時自動執行一次資料抓取並重新發布網站資料。

#### Scenario: 排程執行
- **WHEN** 到達排程時間
- **THEN** 資料被重新抓取並發布，`generatedAt` 更新為該次執行時間

#### Scenario: 排程執行失敗
- **WHEN** 抓取程序以非零狀態結束
- **THEN** 已發布的網站與資料維持上一版不變

### Requirement: 網頁定期重新載入資料
網頁開啟期間 SHALL 每 10 分鐘重新取得資料檔（避開快取），有新資料時就地更新畫面，不需重新整理頁面。

#### Scenario: 背景出現新資料
- **WHEN** 網頁開著且伺服器上的資料檔 `generatedAt` 變新
- **THEN** 10 分鐘內畫面上的數值與圖表更新，且保留使用者選擇的回看期間

### Requirement: 手動更新按鈕（GitHub Pages）
在 GitHub Pages 上，「立即更新」按鈕 SHALL 在使用者已設定 GitHub token 時觸發更新工作流程、顯示進度並在完成後載入新資料；未設定 token 時 MUST 只重新載入目前已發布的資料，並提示如何設定 token。

#### Scenario: 已設定 token
- **WHEN** 使用者按下「立即更新」且已設定有效 token
- **THEN** 按鈕顯示「更新中」，工作流程完成後自動載入新資料並顯示成功訊息

#### Scenario: token 無效
- **WHEN** GitHub API 回傳 401 或 403
- **THEN** 顯示 token 無效的錯誤訊息，並仍重新載入已發布的資料

#### Scenario: 未設定 token
- **WHEN** 使用者按下「立即更新」但未設定 token
- **THEN** 重新載入已發布的資料，並顯示設定 token 的說明連結

### Requirement: token 僅存於使用者瀏覽器
GitHub token SHALL 只儲存在使用者自己的瀏覽器（localStorage），MUST NOT 寫入 repository、資料檔或傳送到 GitHub API 以外的任何地方，且使用者可隨時清除。

#### Scenario: 清除 token
- **WHEN** 使用者在設定中按「清除 token」
- **THEN** token 從瀏覽器移除，之後按「立即更新」只會重新載入已發布資料

### Requirement: 本機模式手動更新
在本機開發伺服器上，「立即更新」按鈕 SHALL 直接要求本機伺服器重新抓取資料，完成後載入新資料。

#### Scenario: 本機按更新
- **WHEN** 在 localhost 上按下「立即更新」
- **THEN** 本機伺服器執行抓取程序，成功後頁面載入新資料；失敗時顯示錯誤訊息
