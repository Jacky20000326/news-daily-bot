# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

加密貨幣每日新聞 AI 自動報告系統。每天定時從多個來源收集加密貨幣新聞，經 Google Gemini AI 分析後，將完整報告發布至 GitHub Pages，並以通知型 Email 寄送頭條摘要與報告連結給訂閱者。

## 常用指令

```bash
# 單次執行完整 pipeline（ts-node）
pnpm dev

# 本地測試（跳過 Email 發送）
DRY_RUN=true pnpm dev

# 啟動長駐排程模式（每天定時執行）
ts-node src/scheduler/index.ts

# 編譯 TypeScript
pnpm build

# 執行已編譯版本（單次）
pnpm start

# 測試
pnpm test                # 單次執行
pnpm test:watch          # 監聽模式
pnpm test:coverage       # 含覆蓋率

# 執行單一測試檔案
pnpm vitest run tests/unit/normalizer.test.ts

# Lint / 格式化
pnpm lint
pnpm lint:fix
pnpm format
```

## 環境設定

複製 `.env.example` 為 `.env`。必要環境變數（缺少任一項啟動即拋出 `ConfigValidationError`）：

| 變數               | 說明                                  |
|--------------------|---------------------------------------|
| `GEMINI_API_KEY`   | Google Gemini API 金鑰                |
| `NEWSAPI_KEY`      | NewsAPI 金鑰                          |
| `SENDER_EMAIL`     | 寄件者 Email                          |
| `EMAIL_RECIPIENTS` | 收件者（逗號分隔）                    |
| `SMTP_USER`        | SMTP 帳號                             |
| `SMTP_PASS`        | SMTP 密碼（Gmail 請使用應用程式密碼） |

選填環境變數：

| 變數                | 預設值            | 說明                                   |
|---------------------|-------------------|----------------------------------------|
| `AI_MODEL`          | `gemini-1.5-flash`| 指定 Gemini 模型                       |
| `SMTP_HOST`         | `smtp.gmail.com`  | SMTP 伺服器主機                        |
| `SMTP_PORT`         | `587`             | SMTP 埠號                              |
| `CRYPTOPANIC_TOKEN` | 空                | CryptoPanic API Token                  |
| `ENABLE_RSS`        | `true`            | 設 `false` 停用 RSS 來源               |
| `GITHUB_TOKEN`      | 空                | GitHub Personal Access Token（Pages 發布用） |
| `GITHUB_OWNER`      | 空                | GitHub 使用者/組織名稱                 |
| `GITHUB_REPO`       | 空                | GitHub 報告 repo 名稱                  |
| `ALERT_EMAIL`       | 空                | 流程失敗時的警示收件者                 |
| `REPORT_HOUR`       | `9`               | 排程觸發小時（24h，台北時間）          |
| `DRY_RUN`           | `false`           | 設 `true` 跳過 Email 寄送（本地測試用）|
| `LOG_LEVEL`         | `info`            | 日誌層級                               |

`dotenv` 僅在非 production 環境載入（`NODE_ENV !== 'production'`）。

## 架構概覽

主流程定義在 `src/index.ts` 的 `runDailyPipeline()`，依序執行：

```
收集（collector）→ 標準化（normalizer）→ 去重（deduplicator）
  → AI 分析（analyzer）→ 產生 HTML 報告（reporter）
  → 發布至 GitHub Pages（publisher）→ 寄送通知 Email（mailer）
```

### 各模組職責

- **`src/collector/`** — 從 3 個來源並行收集（`Promise.allSettled`）：NewsAPI、CryptoPanic、RSS Feeds。單一來源失敗不中斷整體，全部失敗才拋出 `AllSourcesFailedError`
- **`src/normalizer/`** — `RawNewsItem` → `NewsItem`：驗證 URL、解析時間、過濾時間窗外項目、以 SHA-256(url) 前 16 hex 字元生成 ID
- **`src/deduplicator/`** — 兩階段去重：URL 精確去重 → 標題 TF-IDF Cosine Similarity 去重（閾值 0.85，批次 50 筆）
- **`src/analyzer/`** — Gemini AI 分析，兩步驟：
  1. `ranker.ts`：批次 20 筆呼叫 Gemini API，對每筆新聞評分（1-10）、分類、情緒分析；AI 失敗時退回 `classifyByKeywords` 關鍵字備援
  2. `summarizer.ts`：對前 6 筆（`TOP_ITEMS_FOR_SUMMARY`，依評分排序）生成繁體中文摘要（100-150 字），並行度限制 2（`CONCURRENCY_LIMIT`，配合 Gemini 免費層 15 RPM）；另有 `generateExecutiveSummary` 生成整體市場總覽（250-300 字）
- **`src/reporter/`** — 使用 Handlebars 模板（`src/reporter/templates/daily-report.hbs`）生成完整 HTML 報告，同時提供純文字備援版（`buildPlainText`）。模板資料結構：
  - `topStories`：前 6 筆（有 AI 摘要），用於「重點分析」區塊，每張卡片帶 `id="story-{id}"` 錨點
  - `allStoriesByImportance`：全部新聞依重要度排序，有 AI 摘要的條目 `detailLink` 指向信件內錨點，其餘直連原始 URL
  - `categorizedStories`：依分類分組的所有新聞
  - Handlebars 自訂 helper：`eq`、`gte`、`lte`、`lt`、`and`，新增 helper 需在 `src/reporter/index.ts` 中註冊
- **`src/publisher/`** — 透過 GitHub Contents API 將 HTML 報告推送至 repo，由 GitHub Pages 提供線上瀏覽；同時更新 `index.html` 自動轉址至最新報告。三個 config（`GITHUB_TOKEN`/`GITHUB_OWNER`/`GITHUB_REPO`）任一未設定則跳過
- **`src/mailer/`** — 透過 nodemailer SMTP 寄送**通知型 Email**（頭條列表 + 完整報告連結按鈕），非完整報告內容。另有 `sendAlertEmail` 於 pipeline 失敗時寄送警報
- **`src/scheduler/`** — node-cron 排程，預設每天 `REPORT_HOUR`（09:00）Asia/Taipei 觸發

### 型別系統

所有核心型別定義在 `src/types/index.ts`：

- `RawNewsItem` → 收集原始資料
- `NewsItem` → 標準化後
- `AnalyzedNewsItem extends NewsItem` → AI 分析後（含 `importanceScore`、`category`、`aiSummary`、`sentiment`）
- `DailyReport` → 最終報告結構（`topStories` 含前 6 筆，`mdReportUrl` 為 GitHub Pages 連結）

### 重試機制

`src/utils/retry.ts` 提供兩套機制：

- **`httpClient`**（axios-retry）— HTTP 請求用，指數退避（1s/2s/4s），自動重試網路錯誤及 429
- **`withRetry`** — 非 HTTP 用途（如 Gemini API 呼叫），固定間隔，預設 2 次重試。`NonRetryableError` 可跳過重試（如 Gemini 安全篩選器攔截）

### AI 設定

- 提供者：Google Gemini（`@google/generative-ai`）
- 預設模型：`gemini-1.5-flash`，可透過 `AI_MODEL` 環境變數覆寫
- AI 呼叫均透過 `withRetry` 包裝（2 次重試）
- Gemini 安全篩選器攔截時拋出 `NonRetryableError`，不做無意義重試

### 新聞分類

9 個分類定義在 `src/types/index.ts` 的 `NewsCategory`，新增分類需同步修改：型別、`ALL_CATEGORIES`（`src/index.ts`）、AI prompt（`src/analyzer/prompts/ranking.ts`）、`VALID_CATEGORIES`（`src/analyzer/ranker.ts`）、關鍵字備援（`src/analyzer/prompts/classification.ts`）、`CATEGORY_LABELS`（`src/reporter/index.ts`）。

`market` / `regulation` / `technology` / `defi` / `nft` / `security` / `macro` / `exchange` / `other`

## 測試結構

```
tests/
  unit/          # 單元測試
  integration/   # 整合測試：完整 pipeline
  helpers/       # 共用 mock 資料
```

測試框架：Vitest。外部 API 一律 mock。config 模組需 mock 以避免 `ConfigValidationError`。

## 長對話自動保存

當你注意到系統開始壓縮先前的對話訊息（context 接近上限），**必須主動執行以下動作**：

1. 立即通知使用者：「對話已接近 context 上限，正在自動保存進度。」
2. 執行 `/continue` 將當前任務進度、決策脈絡與待辦事項寫入接續文件
3. 建議使用者開啟新 session 並讀取 `.claude/continue/SESSION.md` 接續工作

此行為無需使用者要求，偵測到壓縮即自動觸發。
