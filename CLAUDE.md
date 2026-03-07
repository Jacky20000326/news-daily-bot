# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

加密貨幣每日新聞 AI 自動報告系統。每天定時從多個來源收集加密貨幣新聞，經 AI 分析後以 HTML Email 形式寄送給訂閱者。

## 常用指令

```bash
# 單次執行完整 pipeline（ts-node）
pnpm dev

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

| 變數 | 說明 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API 金鑰 |
| `NEWSAPI_KEY` | NewsAPI 金鑰 |
| `SENDER_EMAIL` | 寄件者 Email |
| `EMAIL_RECIPIENTS` | 收件者（逗號分隔） |
| `SMTP_USER` | SMTP 帳號 |
| `SMTP_PASS` | SMTP 密碼（Gmail 請使用應用程式密碼） |

選填環境變數：

| 變數 | 預設值 | 說明 |
|---|---|---|
| `AI_MODEL` | `claude-sonnet-4-6` | 指定 Anthropic 模型 |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP 伺服器主機 |
| `SMTP_PORT` | `587` | SMTP 埠號 |
| `CRYPTOPANIC_TOKEN` | 空（停用） | CryptoPanic API Token |
| `COINGECKO_API_KEY` | 空（免費層） | CoinGecko API 金鑰 |
| `ENABLE_RSS` | `true` | 設 `false` 停用 RSS 來源 |
| `ENABLE_COINGECKO` | `true` | 設 `false` 停用 CoinGecko 來源 |
| `ALERT_EMAIL` | 空 | 流程失敗時的警示收件者 |
| `REPORT_HOUR` | `9` | 排程觸發小時（24h，台北時間） |
| `DRY_RUN` | `false` | 設 `true` 跳過 Email 寄送（本地測試用） |
| `LOG_LEVEL` | `info` | 日誌層級 |

`dotenv` 僅在非 production 環境載入（`NODE_ENV !== 'production'`）。

## 架構概覽

主流程定義在 `src/index.ts` 的 `runDailyPipeline()`，依序執行以下步驟：

```
收集（collector）
  → 標準化（normalizer）
  → 去重（deduplicator）
  → AI 分析（analyzer）
  → 產生報告（reporter）
  → 寄送 Email（mailer）
```

### 各模組職責

- **`src/collector/`** — 從 4 個來源並行收集（`Promise.allSettled`）；單一來源失敗不中斷整體，全部失敗才拋出 `AllSourcesFailedError`。來源：NewsAPI、CryptoPanic、RSS Feeds、CoinGecko
- **`src/normalizer/`** — 將 `RawNewsItem` 轉為 `NewsItem`：驗證 URL、解析時間、過濾時間窗外的項目、以 SHA-256(url) 前 16 hex 字元生成 ID
- **`src/deduplicator/`** — 兩階段去重：URL 精確去重 → 標題 TF-IDF Cosine Similarity 去重（閾值 0.85，批次 50 筆）
- **`src/analyzer/`** — AI 分析兩步驟：
  1. `ranker.ts`：批次 20 筆呼叫 Claude API，對每筆新聞評分（1-10）、分類、情緒分析；AI 失敗時退回關鍵字分類備援
  2. `summarizer.ts`：對前 15 筆（依評分排序）生成繁體中文摘要（100-150 字）及整體執行摘要
- **`src/reporter/`** — 使用 Handlebars 模板（`src/reporter/templates/daily-report.hbs`）生成 HTML；同時提供純文字備援版（`buildPlainText`）。模板接收三組資料：
  - `topStories`：前 15 筆（有 AI 摘要），用於「重點分析」區塊，每張卡片帶 `id="story-{id}"` 錨點
  - `allStoriesByImportance`：全部新聞依重要度排序，用於信件頂部「優先閱讀清單」；有 AI 摘要的條目 `detailLink` 指向信件內錨點，其餘直連原始 URL
  - `categorizedStories`：依分類分組的所有新聞
  - Handlebars 自訂 helper：`eq`、`gte`、`lte`、`lt`、`and`，新增模板條件邏輯時需確認 helper 已在 `src/reporter/index.ts` 中註冊
- **`src/mailer/`** — 透過 nodemailer SMTP 寄送
- **`src/scheduler/`** — node-cron 排程，預設每天 09:00 Asia/Taipei 觸發

### 型別系統

所有核心型別定義在 `src/types/index.ts`：
- `RawNewsItem` → 收集原始資料
- `NewsItem` → 標準化後
- `AnalyzedNewsItem extends NewsItem` → AI 分析後（含 `importanceScore`、`category`、`aiSummary`、`sentiment`）
- `DailyReport` → 最終報告結構（`topStories` 含前 15 筆，與 AI 摘要生成數量一致）

### 重試機制

`src/utils/retry.ts` 提供兩套機制，用途不同：
- **`httpClient`**（axios-retry）— HTTP 請求用，指數退避（1s/2s/4s），自動重試網路錯誤及 429
- **`withRetry`** — 非 HTTP 用途（如 Claude API 呼叫），固定間隔，預設 2 次重試

### AI 設定

預設模型 `claude-sonnet-4-6`，可透過 `AI_MODEL` 環境變數覆寫。AI 呼叫（ranker、summarizer）均透過 `withRetry` 包裝（2 次重試，間隔 2 秒）。

### 新聞分類

`market` / `regulation` / `technology` / `defi` / `nft` / `security` / `macro` / `exchange` / `other`

## 測試結構

```
tests/
  unit/          # 單元測試：normalizer、deduplicator、ranker
  integration/   # 整合測試：完整 pipeline
  helpers/       # 共用 mock 資料
```

測試框架：Vitest。
