# 工程上手指南 — 加密貨幣每日新聞系統

> 本文件從工程角度出發，幫助開發者快速理解系統架構、資料流、關鍵模組與開發流程。

---

## 目錄

1. [系統全貌](#1-系統全貌)
2. [本地啟動](#2-本地啟動)
3. [Pipeline 資料流](#3-pipeline-資料流)
4. [模組拆解](#4-模組拆解)
5. [型別系統](#5-型別系統)
6. [AI 整合細節](#6-ai-整合細節)
7. [重試與容錯機制](#7-重試與容錯機制)
8. [模板渲染](#8-模板渲染)
9. [測試策略](#9-測試策略)
10. [CI/CD 部署](#10-cicd-部署)
11. [常見擴展場景](#11-常見擴展場景)
12. [已知限制](#12-已知限制)

---

## 1. 系統全貌

這是一個 **全自動 AI 新聞分析 Pipeline**，每天定時執行以下流程：

```
收集 → 標準化 → 去重 → AI 分析 → HTML 報告 → GitHub Pages 發布 → Email 通知
```

**技術棧**：TypeScript + Node.js、Google Gemini AI、Handlebars 模板、nodemailer SMTP、GitHub Pages

**進入點**：

- `src/index.ts` — 單次執行 `runDailyPipeline()`
- `src/scheduler/index.ts` — 長駐排程（node-cron，預設每天 09:00 Asia/Taipei）

---

## 2. 本地啟動

### 2.1 環境準備

```bash
# 安裝依賴
pnpm install

# 複製環境變數範本
cp .env.example .env
```

編輯 `.env`，填入以下**必要**變數（缺一則拋 `ConfigValidationError`）：

| 變數                      | 說明                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| `GEMINI_API_KEY`          | [Google AI Studio](https://aistudio.google.com/) 取得                   |
| `NEWSAPI_KEY`             | [NewsAPI](https://newsapi.org/) 取得                                    |
| `SENDER_EMAIL`            | 寄件者 Email                                                            |
| `EMAIL_RECIPIENTS`        | 收件者（逗號分隔）                                                      |
| `SMTP_USER` / `SMTP_PASS` | Gmail 建議使用[應用程式密碼](https://myaccount.google.com/apppasswords) |

### 2.2 執行

```bash
# 本地測試（跳過 Email 發送）
DRY_RUN=true pnpm dev

# 完整執行（含 Email）
pnpm dev

# 排程模式（長駐）
ts-node src/scheduler/index.ts
```

### 2.3 常用指令速查

```bash
pnpm build              # 編譯 TypeScript → dist/
pnpm start              # 執行編譯版本
pnpm test               # 跑測試
pnpm test:coverage      # 測試 + 覆蓋率
pnpm lint:fix           # 自動修正 lint
pnpm format             # Prettier 格式化
```

---

## 3. Pipeline 資料流

```
                    ┌─────────────┐
                    │  NewsAPI    │
                    │ CryptoPanic │──→ RawNewsItem[]
                    │  RSS Feeds  │
                    └──────┬──────┘
                           │ Promise.allSettled（任一成功即可）
                           ▼
                    ┌──────────────┐
                    │  Normalizer  │──→ NewsItem[]
                    │  驗證/解析/ID │     SHA-256(url) 前 16 hex
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │ Deduplicator │──→ NewsItem[]（去重後）
                    │ URL + TF-IDF │     閾值 0.85
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │   Analyzer   │──→ AnalyzedNewsItem[]
                    │ 評分→摘要→深度│     精選 10 筆
                    └──────┬───────┘
                           ▼
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Reporter │ │Publisher │ │  Mailer  │
        │ HTML生成 │ │ GH Pages │ │  SMTP    │
        └──────────┘ └──────────┘ └──────────┘
```

**關鍵數字**：

| 階段     | 處理量                                   |
| -------- | ---------------------------------------- |
| 評分批次 | 每批 20 筆，間隔 1 秒                    |
| AI 摘要  | 前 15 筆取摘要，截斷至前 10 筆精選       |
| 深度分析 | 前 6 筆（抓取原文 + AI 分析 400-600 字） |
| 摘要並行 | 限制 2 並行（配合 Gemini 免費層 15 RPM） |

---

## 4. 模組拆解

### 4.1 Collector (`src/collector/`)

| 檔案             | 來源          | 特點                                                              |
| ---------------- | ------------- | ----------------------------------------------------------------- |
| `newsapi.ts`     | NewsAPI       | 分頁 100 筆/頁，依 `publishedAt` 排序                             |
| `cryptopanic.ts` | CryptoPanic   | 需 `CRYPTOPANIC_TOKEN`，未設定回傳空陣列                          |
| `rss.ts`         | 5 個 RSS Feed | CoinDesk / CoinTelegraph / The Block / Decrypt / Bitcoin Magazine |

**容錯設計**：`index.ts` 使用 `Promise.allSettled`，任一來源失敗不影響其他，**全部失敗**才拋 `AllSourcesFailedError`。

### 4.2 Normalizer (`src/normalizer/index.ts`)

- ID 生成：`SHA-256(url)` 取前 16 hex 字元
- 時間解析：過濾時間窗外項目
- URL 驗證：僅接受 `http://` 或 `https://`
- Content 合併：優先 `content`，無則 `title + summary`

### 4.3 Deduplicator (`src/deduplicator/index.ts`)

兩階段去重：

1. **URL 精確去重**：正規化 URL（小寫 scheme+host、移除 UTM 參數、移除尾端 `/`）
2. **標題相似度去重**：`natural` 套件 TF-IDF + Cosine Similarity，閾值 `0.85`，衝突時保留較早的新聞

### 4.4 Analyzer (`src/analyzer/`)

三步驟流程：

```
rankAndClassify()     → 批次 Gemini 評分 + 分類 + 情緒
  ↓
summarizeItems()      → 精選新聞 AI 摘要 + 市場總覽
  ↓
deepAnalyzeItems()    → 前 6 筆原文抓取 + 深度分析
```

**提示詞目錄** (`src/analyzer/prompts/`)：

| 檔案                | 用途                                      |
| ------------------- | ----------------------------------------- |
| `ranking.ts`        | 評分 1-10、分類（9 類）、情緒、相關幣種   |
| `summary.ts`        | 單則摘要 100-150 字 + 市場總覽 250-300 字 |
| `deep-analysis.ts`  | 深度分析 400-600 字（Markdown 格式）      |
| `classification.ts` | AI 失敗時的**關鍵字備援分類**             |

**9 個分類**：`market` / `regulation` / `technology` / `defi` / `nft` / `security` / `macro` / `exchange` / `other`

### 4.5 Reporter (`src/reporter/`)

| 函式                   | 輸出       | 用途                          |
| ---------------------- | ---------- | ----------------------------- |
| `generateReport()`     | Email HTML | 通知信（頭條清單 + 重點分析） |
| `generateFullReport()` | 完整 HTML  | GitHub Pages（含深度分析）    |
| `buildPlainText()`     | 純文字     | Email text/plain 備援         |

模板位於 `src/reporter/templates/`，使用 Handlebars。自訂 helper：`eq`、`gte`、`lte`、`lt`、`and`、`index_1`。

### 4.6 Publisher (`src/publisher/index.ts`)

- 透過 GitHub Contents API 推送 HTML 至 repo
- 檔名格式：`crypto-daily-{YYYY-MM-DD}.html`
- 自動更新 `index.html`（3 秒轉址至最新報告）
- 需設定 `GH_PAGES_TOKEN` + `GH_PAGES_OWNER` + `GH_PAGES_REPO`，任一缺少則跳過

### 4.7 Mailer (`src/mailer/index.ts`)

| 收件對象                         | 內容                                      |
| -------------------------------- | ----------------------------------------- |
| 一般收件者                       | 通知信：頭條清單 + 完整報告連結按鈕       |
| Gmail 白名單 (`GMAIL_WHITELIST`) | 完整報告 HTML（便於 Gmail 搜尋）          |
| `ALERT_EMAIL`                    | Pipeline 失敗時的警報信（含 Stack Trace） |

### 4.8 Utils (`src/utils/`)

| 檔案               | 功能                                                          |
| ------------------ | ------------------------------------------------------------- |
| `logger.ts`        | JSON 格式日誌，`LOG_LEVEL` 控制層級                           |
| `retry.ts`         | `httpClient`（axios-retry 指數退避）+ `withRetry`（通用重試） |
| `time.ts`          | 台北時區工具：時間窗、日期字串、格式化                        |
| `token-tracker.ts` | Gemini API Token 用量追蹤（單例）                             |

---

## 5. 型別系統

核心型別定義在 `src/types/index.ts`，資料在 pipeline 中逐步強化：

```
RawNewsItem          → 外部 API 原始資料
    ↓ normalize()
NewsItem             → 加入 id (SHA-256)、Date 物件、tags 正規化
    ↓ analyze()
AnalyzedNewsItem     → 加入 importanceScore、category、aiSummary、sentiment、deepAnalysis?
    ↓ 組裝
DailyReport          → 最終報告（topStories[10]、executiveSummary、mdReportUrl）
```

**關鍵型別速查**：

```typescript
interface RawNewsItem {
  source: SourceType; // 'newsapi' | 'cryptopanic' | 'rss' | 'coingecko'
  rawId: string;
  url: string;
  title: string;
  content?: string;
  summary?: string;
  publishedAt: string; // ISO 字串
  tags?: string[];
}

interface NewsItem extends RawNewsItem {
  id: string; // SHA-256(url) 前 16 hex
  publishedAt: Date; // 已解析為 Date 物件
  tags: string[]; // 已正規化
}

interface AnalyzedNewsItem extends NewsItem {
  importanceScore: number; // 1-10
  category: NewsCategory;
  aiSummary?: string; // 繁體中文 100-150 字
  sentiment: Sentiment; // 'positive' | 'negative' | 'neutral'
  relatedTickers?: string[]; // ['BTC', 'ETH', ...]
  deepAnalysis?: string; // Markdown 400-600 字
}

interface DailyReport {
  reportDate: string; // YYYY-MM-DD
  topStories: AnalyzedNewsItem[]; // 前 10 筆
  executiveSummary: string; // 市場總覽 250-300 字
  mdReportUrl?: string; // GitHub Pages 連結
  // ... 其他統計欄位
}
```

**自訂錯誤**：

- `AllSourcesFailedError` — 所有新聞來源均失敗
- `ConfigValidationError` — 環境變數缺少必要項

---

## 6. AI 整合細節

### Gemini 呼叫流程

```
src/analyzer/ranker.ts
  → GoogleGenerativeAI(GEMINI_API_KEY)
  → model.generateContent(prompt)
  → tokenTracker.record(response.usageMetadata)
  → JSON.parse(response.text())
```

### 速率控制

| 限制                 | 對策                                               |
| -------------------- | -------------------------------------------------- |
| Gemini 免費層 15 RPM | 摘要並行度限制 2                                   |
| 批次評分             | 每批 20 筆 → 單次 API 呼叫，批次間隔 1 秒          |
| Token 上限           | `token-tracker.ts` 追蹤用量，logSummary() 輸出統計 |

### 備援機制

當 Gemini API 呼叫失敗時：

1. `withRetry` 重試 2 次（固定延遲）
2. 安全篩選器攔截 → `NonRetryableError`，直接放棄
3. 所有重試失敗 → 退回 `classifyByKeywords()` 關鍵字分類（`src/analyzer/prompts/classification.ts`）

---

## 7. 重試與容錯機制

`src/utils/retry.ts` 提供兩套策略：

### httpClient（HTTP 請求專用）

```typescript
// axios + axios-retry
// 指數退避：1s → 2s → 4s
// 自動重試：網路錯誤、HTTP 429（速率限制）
import { httpClient } from "./utils/retry";
const res = await httpClient.get("https://...");
```

### withRetry（通用非 HTTP）

```typescript
// 用於 Gemini API 呼叫等場景
import { withRetry, NonRetryableError } from "./utils/retry";

const result = await withRetry(() => geminiModel.generateContent(prompt), {
  retries: 2,
  delay: 2000,
});

// 不可重試的錯誤（如安全篩選器）
throw new NonRetryableError("Safety filter blocked");
```

### 容錯設計總覽

| 場景                | 處理方式                        |
| ------------------- | ------------------------------- |
| 單一新聞來源失敗    | `Promise.allSettled` 忽略，繼續 |
| 全部來源失敗        | 拋 `AllSourcesFailedError`      |
| AI 評分失敗         | 關鍵字備援分類                  |
| AI 安全篩選器       | `NonRetryableError`，跳過該筆   |
| GitHub Pages 未設定 | 跳過發布，記錄警告              |
| Pipeline 失敗       | `sendAlertEmail()` 警報         |

---

## 8. 模板渲染

### Handlebars 模板

| 模板            | 路徑                                      | 用途                |
| --------------- | ----------------------------------------- | ------------------- |
| Email 通知版    | `src/reporter/templates/daily-report.hbs` | 頭條清單 + 重點分析 |
| GitHub Pages 版 | `src/reporter/templates/full-report.hbs`  | 完整報告含深度分析  |

### 自訂 Helper

在 `src/reporter/index.ts` 中註冊：

```handlebars
{{#if (eq category "market")}}     {{!-- 相等判斷 --}}
{{#if (gte importanceScore 9)}}    {{!-- 大於等於 --}}
{{#if (and hasDeep hasScore)}}     {{!-- AND 邏輯 --}}
{{index_1 @index}}                 {{!-- @index + 1 --}}
```

### 重要度色條

| 分數 | 顏色             |
| ---- | ---------------- |
| 9-10 | 紅色（重大事件） |
| 7-8  | 橘色（顯著影響） |
| 5-6  | 藍色（一般新聞） |
| <5   | 灰色（低影響）   |

---

## 9. 測試策略

### 框架：Vitest

```bash
pnpm test                                    # 跑全部
pnpm vitest run tests/unit/normalizer.test.ts # 跑單一檔案
pnpm test:coverage                           # 含覆蓋率
```

### 目錄結構

```
tests/
├── unit/                  # 各模組單元測試
│   ├── normalizer.test.ts
│   ├── deduplicator.test.ts
│   ├── ranker.test.ts
│   ├── reporter.test.ts
│   ├── mailer.test.ts
│   ├── publisher.test.ts
│   └── scheduler.test.ts
├── integration/
│   └── pipeline.test.ts   # 完整 pipeline 測試
├── e2e/
│   └── full-pipeline.test.ts
└── helpers/
    └── mocks.ts            # 共用 mock 資料工廠
```

### 測試要點

1. **Config mock 必備**：所有測試必須 mock `src/config`，否則缺少環境變數會拋 `ConfigValidationError`
2. **外部 API 一律 mock**：NewsAPI、CryptoPanic、Gemini、SMTP 都不打真實請求
3. **Mock 工廠函式**（`tests/helpers/mocks.ts`）：

```typescript
mockTimeWindow()          // 過去 24 小時時間窗
mockRawItem(overrides?)   // 測試用 RawNewsItem
mockNewsItem(overrides?)  // 測試用 NewsItem
mockAnalyzedItem()        // 測試用 AnalyzedNewsItem
```

### 設定（vitest.config.ts）

- 環境：Node
- 超時：30 秒
- 全域函式：`describe`、`it`、`expect`
- 覆蓋率排除：`src/types/**`、`src/config/**`

---

## 10. CI/CD 部署

### GitHub Actions (`.github/workflows/daily-report.yml`)

**觸發**：

- 每天 01:00 UTC（= 09:00 Asia/Taipei）
- 手動觸發（workflow_dispatch）

**流程**：

```
Checkout → Node 20 + pnpm → pnpm build → 驗證模板 → node dist/index.js
```

**環境**：`NODE_ENV=production`（跳過 dotenv 載入）

### 需在 GitHub Secrets 設定的變數

必要：`GEMINI_API_KEY`、`NEWSAPI_KEY`、`SENDER_EMAIL`、`EMAIL_RECIPIENTS`、`SMTP_USER`、`SMTP_PASS`

選填：`GH_PAGES_TOKEN`（映射為 `GH_PAGES_TOKEN`）、`GH_PAGES_OWNER`、`GH_PAGES_REPO`、`CRYPTOPANIC_TOKEN`、`GMAIL_WHITELIST`、`ALERT_EMAIL`

---

## 11. 常見擴展場景

### 新增新聞來源

1. 在 `src/collector/` 新增收集器檔案（如 `coingecko.ts`）
2. 實作函式，回傳 `RawNewsItem[]`
3. 在 `src/collector/index.ts` 的 `sources` 陣列加入呼叫

### 新增新聞分類

需同步修改 **5 處**：

| 位置                                     | 修改項                      |
| ---------------------------------------- | --------------------------- |
| `src/types/index.ts`                     | `NewsCategory` 型別         |
| `src/index.ts`                           | `ALL_CATEGORIES` 陣列       |
| `src/analyzer/prompts/ranking.ts`        | AI 提示詞                   |
| `src/analyzer/ranker.ts`                 | `VALID_CATEGORIES` 驗證集合 |
| `src/analyzer/prompts/classification.ts` | 關鍵字備援                  |
| `src/reporter/index.ts`                  | `CATEGORY_LABELS` 中文標籤  |

### 調整 AI 行為

- 評分標準：修改 `src/analyzer/prompts/ranking.ts`
- 摘要風格：修改 `src/analyzer/prompts/summary.ts`
- 深度分析：修改 `src/analyzer/prompts/deep-analysis.ts`
- 精選數量：修改 `src/analyzer/summarizer.ts` 的 `TOP_ITEMS_FOR_SUMMARY`

### 修改報告樣式

- Email 版面：`src/reporter/templates/daily-report.hbs`（注意 HTML Email 限制，需用 table 佈局）
- GitHub Pages 版面：`src/reporter/templates/full-report.hbs`
- 新增 Handlebars helper：在 `src/reporter/index.ts` 中註冊

---

## 12. 已知限制

| 限制          | 說明                                              |
| ------------- | ------------------------------------------------- |
| Gemini 免費層 | 15 RPM，透過並行度限制與批次間隔控制              |
| HTML Email    | 不支援 CSS 媒體查詢，使用 table 佈局              |
| 文章抓取      | 截斷至 8000 字；內容不足 100 字跳過深度分析       |
| 時區          | 預設 Asia/Taipei（UTC+8），可透過 `TIMEZONE` 調整 |
| GitHub Pages  | 需啟用 Pages 且 token 具備 `contents:write` 權限  |
| dotenv        | 僅在 `NODE_ENV !== 'production'` 載入             |

---

## 附錄：檔案速查表

```
src/
├── index.ts                    ← 主 pipeline 入口
├── config/index.ts             ← 環境變數驗證
├── types/index.ts              ← 所有核心型別
├── collector/
│   ├── index.ts                ← 收集協調器
│   ├── newsapi.ts              ← NewsAPI 收集
│   ├── cryptopanic.ts          ← CryptoPanic 收集
│   └── rss.ts                  ← RSS 收集（5 個 feed）
├── normalizer/index.ts         ← 標準化 + ID 生成
├── deduplicator/index.ts       ← URL + TF-IDF 去重
├── analyzer/
│   ├── index.ts                ← 分析協調器
│   ├── ranker.ts               ← Gemini 評分 + 分類
│   ├── summarizer.ts           ← AI 摘要生成
│   ├── deep-analyzer.ts        ← 深度分析
│   ├── article-fetcher.ts      ← 原文抓取（cheerio）
│   └── prompts/                ← AI 提示詞
├── reporter/
│   ├── index.ts                ← 報告生成
│   └── templates/              ← Handlebars 模板
├── publisher/index.ts          ← GitHub Pages 發布
├── mailer/index.ts             ← Email 發送
├── scheduler/index.ts          ← node-cron 排程
└── utils/
    ├── logger.ts               ← JSON 日誌
    ├── retry.ts                ← 重試機制
    ├── time.ts                 ← 時區工具
    └── token-tracker.ts        ← Token 追蹤
```
