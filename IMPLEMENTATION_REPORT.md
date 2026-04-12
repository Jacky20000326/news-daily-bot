# 加密貨幣每日新聞 AI 自動報告系統 - 實作詳細分析報告

## 目錄
1. [項目概述](#項目概述)
2. [架構設計](#架構設計)
3. [核心流程](#核心流程)
4. [關鍵模塊分析](#關鍵模塊分析)
5. [技術棧](#技術棧)
6. [新增功能](#新增功能)
7. [錯誤處理機制](#錯誤處理機制)
8. [測試策略](#測試策略)
9. [部署與運行](#部署與運行)

---

## 項目概述

### 功能定位
該項目是一個**全自動化的加密貨幣新聞聚合與分析系統**，負責：
- **每日定時收集**：從多個新聞來源（NewsAPI、CoinDesk、Messari）並行收集加密貨幣新聞
- **智能去重**：三階段去重機制確保新聞唯一性（URL精確、語義相似度、跨日歷史對比）
- **AI分析與分類**：利用 Google Gemini 對新聞進行評分（1-10）、分類、情緒分析與摘要生成
- **多渠道發布**：
  - 生成完整 HTML 報告發布至 GitHub Pages
  - 寄送通知型 Email 給訂閱者
  - 生成語音導讀（TTS 或 NotebookLM Podcast）
- **排程執行**：使用 node-cron 每日定時執行

### 核心數據流
```
原始新聞 → 標準化 → 去重 → AI分析 → 報告生成 → 多渠道發布
```

---

## 架構設計

### 模塊化設計原則
項目採用**高內聚、低耦合**的模塊化設計，各模塊職責明確：

| 模塊 | 職責 | 關鍵特性 |
|------|------|--------|
| **collector/** | 新聞來源收集 | 並行收集（Promise.allSettled），單一來源失敗不中斷 |
| **normalizer/** | 數據標準化 | URL驗證、時間解析、內容合併、ID生成 |
| **deduplicator/** | 去重機制 | URL精確去重 → 語義去重 → 歷史去重 |
| **analyzer/** | AI分析與分類 | 批次評分、摘要生成、深度分析 |
| **reporter/** | 報告生成 | Handlebars模板引擎，生成HTML+純文字 |
| **publisher/** | 發布管理 | GitHub API推送、GitHub Pages自動更新 |
| **mailer/** | Email通知 | nodemailer SMTP發送通知型Email |
| **tts/** | 語音合成 | Google Gemini TTS 或 NotebookLM Podcast |
| **podcast/** | Podcast生成 | NotebookLM API 調用，支持多認證方式 |
| **config/** | 配置管理 | 環境變數驗證，啟動時強制檢查 |
| **utils/** | 工具函數 | 日誌、時間、重試、Token追蹤 |

### 型別系統架構
```typescript
RawNewsItem (原始)
  ↓
NewsItem (標準化)
  ↓
AnalyzedNewsItem extends NewsItem (AI分析)
  ↓
DailyReport (最終報告)
```

---

## 核心流程

### 主流程：`runDailyPipeline()` (src/index.ts)

```
1. 取得時間窗 (Asia/Taipei)
   from: 昨日 00:00 Taipei → 前日 16:00 UTC
   to:   今日 09:00 Taipei → 今日 01:00 UTC

2. 並行收集原始新聞 (Promise.allSettled)
   - NewsAPI
   - CoinDesk
   - Messari (若啟用)

3. 標準化 (normalize)
   - 驗證URL、解析時間戳
   - 過濾時間窗外項目
   - 生成ID (SHA-256 前16字元)
   - 合併content

4. 去重 (deduplicate)
   三階段：URL → 語義 → 歷史

5. AI分析 (analyze)
   - 批次10筆評分、分類
   - 對前15筆生成摘要
   - 對前6筆進行深度分析

6. 執行摘要生成 (generateExecutiveSummary)
   - 250-300字的市場整體分析

7. 語音合成 (TTS/Podcast)
   - 兩種模式：
     a) generatePodcast: NotebookLM 雙主持人Podcast
     b) generateNarration: Google Gemini TTS 單聲道

8. 報告生成 (generateFullReport)
   - HTML報告 (GitHub Pages用)
   - 含深度分析、媒體資源等

9. GitHub Pages發布 (publishToGitHubPages)
   - 推送HTML至repo
   - 更新index.html自動轉址

10. 歷史記錄更新 (appendToHistory)
    - 寫入 data/dedup-history.json

11. Email發送 (sendReport)
    - 發送通知型Email + 完整報告連結

12. Token用量統計 (tokenTracker.logSummary)
    - 記錄Gemini API消耗

13. 整體耗時記錄
```

### 時間邏輯
```
Asia/Taipei 時區邏輯：
- 報告時間窗：前日 00:00 - 當日 09:00 (Taipei時間)
- 實際UTC計算：
  from = 前日 16:00 UTC (Taipei 00:00)
  to   = 當日 01:00 UTC  (Taipei 09:00)
  
台北時間 09:00 = UTC+8 = UTC 01:00

排程觸發：
- 默認每日 09:00 Asia/Taipei
- 對應 01:00 UTC
```

---

## 關鍵模塊分析

### 1. 收集器 (collector/)

#### 設計特點
- **並行收集**：使用 `Promise.allSettled` 確保單一來源失敗不中斷整體
- **動態來源啟用**：通過環境變數控制各源的啟用/禁用
- **來源定義框架**：
  ```typescript
  interface SourceDefinition {
    name: SourceType;
    enabled: boolean;
    fetch: (timeWindow: TimeWindow) => Promise<RawNewsItem[]>;
  }
  ```

#### 實作流程
```
1. 篩選已啟用來源
2. 並行發起所有來源請求
3. 捕獲 fulfilled / rejected 結果
4. 若所有來源均失敗 → 拋出 AllSourcesFailedError
5. 合併成功結果，記錄詳細日誌
```

#### 來源適配
- **NewsAPI**：通用新聞API，搜索"crypto" / "bitcoin" / "ethereum"
- **CoinDesk**：加密貨幣專業媒體RSS
- **Messari**：加密資訊平台API (可選)

---

### 2. 標準化器 (normalizer/)

#### 數據轉換
```
RawNewsItem 屬性轉換表：
source → sourceType
rawId → 丟棄（用URL生成新ID）
publishedAt (字串) → publishedAt (Date, UTC)
content / summary → content (合併)
tags → tags (小寫、去空白)
```

#### 驗證規則
| 規則 | 說明 | 失敗動作 |
|------|------|--------|
| URL有效性 | 必須為http/https | 過濾 |
| 時間解析 | ISO 8601或標準格式 | 過濾 |
| 時間窗檢查 | 在目標窗內 | 過濾 |
| Title非空 | 必須有標題 | 過濾 |

#### ID生成邏輯
```javascript
id = SHA256(url).hex().slice(0, 16)
// 確保相同URL在多個來源/日期都映射到同一ID
```

---

### 3. 去重器 (deduplicator/)

#### 三階段去重策略

**第一階段：URL精確去重**
```
相同URL → 直接丟棄重複項
```

**第二階段：語義去重 (當日)**
```
使用 Xenova/all-MiniLM-L6-v2 Embedding模型：
1. 對每條新聞生成 embedding (384維向量)
2. 文本 = title + content前300字
3. 餘弦相似度計算
4. 閾值 0.72 以上 → 判定為重複
5. 保留相似度最高的一條

模型特性：
- 單例模式：首次加載後緩存，避免重複初始化
- 歸一化：輸出為歸一化向量，便於餘弦相似度計算
```

**第三階段：歷史去重 (跨日)**
```
與過去7天已報導新聞對比：
1. 讀取 data/dedup-history.json
2. 使用同樣的embedding模型
3. 閾值 0.70 (略低於當日去重)
4. 丟棄相似的舊聞

目的：避免同一事件重複報導多日
```

#### 去重結果結構
```typescript
{
  items: NewsItem[];
  removedByUrl: number;      // URL精確重複數
  removedByTitle: number;    // 語義重複數
  removedByHistory: number;  // 跨日歷史重複數
}
```

---

### 4. 分析器 (analyzer/)

#### 多步驟分析流程

**步驟1：批次評分與分類 (rankAndClassify)**
```
過程：
1. 將新聞分批（批大小10）
2. 每批調用Gemini API
3. 回傳JSON格式結果：
   {
     importanceScore: 1-10,
     category: NewsCategory,
     relatedTickers: string[],
     sentiment: 'positive'|'negative'|'neutral'
   }
4. 若AI失敗 → 回退到關鍵字分類

驗證：
- 評分範圍檢查：1-10，越界改為5
- 分類值檢查：enum驗證，非法值改為'other'
- 情感值檢查：enum驗證，非法值改為'neutral'

並行度：
- 批次間隔 1秒（配合Gemini免費層15 RPM限制）
- 重試：2次，延遲2秒

分類體系 (9個)：
- market: 市場行情、價格動態
- regulation: 政策監管
- technology: 技術進展
- defi: 去中心化金融
- nft: NFT相關
- security: 安全事件
- macro: 總體經濟
- exchange: 交易所動態
- other: 其他
```

**步驟2：摘要生成 (summarizeItems)**
```
流程：
1. 將前15名新聞分批調用Gemini
2. 生成繁體中文摘要（100-150字）
3. 並行度限制：2並發（Gemini 15 RPM）
4. 未進入前15的新聞 → aiSummary = ''

Prompt模板：
- 語言：繁體中文
- 字數：100-150字
- 包含：新聞要點、市場影響
```

**步驟3：深度分析 (deepAnalyzeItems)**
```
針對前6名重點新聞：
1. 抓取原文全文 (HTML → 純文字)
2. 調用Gemini進行深入分析（400-600字）
3. 生成 deepAnalysis 字段

深度分析包含：
- 背景脈絡
- 市場影響評估
- 相關方利益分析
- 未來展望

失敗處理：
- 原文抓取失敗 → 用標題+摘要替代
- AI分析失敗 → deepAnalysis = undefined
```

**步驟4：重要度篩選**
```
1. 依 importanceScore 降序排序
2. 保留前10名（TOP_ITEMS_TO_KEEP）
3. 丟棄評分低的新聞
4. 最終返回AnalyzedNewsItem[]
```

#### 執行摘要生成 (generateExecutiveSummary)
```
輸入：前6名精選新聞
輸出：250-300字的市場整體分析

Prompt：
- 綜合這些新聞的情況
- 分析市場整體趨勢
- 繁體中文
- 250-300字

用途：Email和報告開頭的市場總覽
```

---

### 5. 報告生成器 (reporter/)

#### 技術棧
- **模板引擎**：Handlebars
- **模板位置**：`src/reporter/templates/daily-report.hbs`

#### 模板數據結構
```typescript
{
  // 基本信息
  reportDate: string;              // YYYY-MM-DD
  generatedAt: Date;
  
  // 統計數據
  totalCollected: number;
  afterDedup: number;
  
  // 核心內容
  topStories: AnalyzedNewsItem[];  // 前10名
  executiveSummary: string;        // 市場總覽
  
  // 元數據
  sources: string[];               // 使用來源
  mdReportUrl?: string;            // GitHub Pages URL
  audioUrl?: string;               // 語音導讀URL
  
  // 其他
  ...timeWindow, ...
}
```

#### Handlebars Helper 註冊
```typescript
eq(a, b)         // 相等比較
gte(a, b)        // 大於等於
lte(a, b)        // 小於等於
lt(a, b)         // 小於
and(a, b)        // 邏輯AND
index_1(i)       // 1-based索引
```

#### 多格式輸出
```
1. HTML報告 (GitHub Pages用)
   - 含完整樣式、媒體資源
   - 支援深度分析的Markdown → HTML轉換
   - 錨點連結 (#story-{id})

2. 純文字版本 (Email備援)
   - 用於無法加載HTML的客户端
```

---

### 6. 發布器 (publisher/)

#### GitHub Pages 發布流程

```
1. 驗證配置 (GH_PAGES_TOKEN/OWNER/REPO)
   若任一缺失 → 跳過發布

2. 獲取現有SHA
   GET /repos/{owner}/{repo}/contents/{path}
   → 若檔案存在，取其SHA（用於更新）

3. 推送新檔案
   PUT /repos/{owner}/{repo}/contents/{path}
   payload:
   {
     message: "報告標題",
     content: base64(htmlContent),
     sha?: "existing-sha"  // 若為更新
   }

4. 更新自動轉址頁面
   index.html 內含 meta refresh
   自動跳轉到最新報告
```

#### 檔案結構
```
repo/
├── reports/
│   ├── 2026-04-10.html
│   ├── 2026-04-09.html
│   └── ...
├── audio/
│   ├── 2026-04-10.wav (或 .mp3)
│   └── ...
└── index.html (自動轉址)
```

---

### 7. 郵件發送器 (mailer/)

#### Email 設計
```
主旨：[加密日報] YYYY-MM-DD 市場重點：{頭條}

內容結構：
┌─────────────────────────────────┐
│  歡迎信頭 + 市場總覽            │
├─────────────────────────────────┤
│  前10則新聞表格                 │
│  編號 │ 標題 │ 來源              │
├─────────────────────────────────┤
│  [查看完整報告] 按鈕             │
│  點擊跳轉至GitHub Pages         │
├─────────────────────────────────┤
│  使用來源清單                    │
└─────────────────────────────────┘
```

#### SMTP 配置
```
默認提供商：Gmail
- SMTP主機：smtp.gmail.com
- 埠號：587 (TLS)
- 認證：須使用應用程式密碼（非Google帳密）

支援自訂：
- SMTP_HOST、SMTP_PORT
```

#### nodemailer 使用
```javascript
const transporter = nodemailer.createTransport({
  host: config.email.smtp.host,
  port: config.email.smtp.port,
  secure: false,  // TLS (587)
  auth: {
    user: config.email.smtp.user,
    pass: config.email.smtp.pass,
  }
});
```

---

### 8. 語音合成 (tts/ & podcast/)

#### 兩種語音模式

**模式A：TTS（傳統文字轉語音）**
```
使用 Google Gemini 2.5 Flash TTS：
- 模型：gemini-2.5-flash-preview-tts
- 聲音：Kore (女性)
- 語言：中文 (自動檢測)

流程：
1. buildNarrationSegments() 構建分段文本：
   - 開場 + 執行摘要
   - 逐則新聞（標題+摘要+深度分析）
   - 結語

2. 將段落合併為不超過 4000 字符的分段
   （保守避免超過8192 token限制）

3. 並行調用Gemini TTS API
   單次返回PCM音頻流

4. PCM → WAV 轉碼
   標準格式：
   - 採樣率：24kHz
   - 通道：1 (Mono)
   - 位深：16-bit
   - 字節序：Little-Endian

5. 推送至GitHub (audio/YYYY-MM-DD.wav)

特點：
- 單聲道
- 文檔化的轉碼過程
```

**模式B：Podcast（NotebookLM 雙主持人）**
```
使用 NotebookLM 的 Audio Overview：

認證優先順序：
1. 環境變數：NOTEBOOKLM_AUTH_TOKEN + NOTEBOOKLM_COOKIES
2. 已儲存credentials (由scripts/notebooklm-login.ts生成)
3. Email/Password自動登入（Playwright）

流程：
1. 創建client (notebooklm-kit library)
   - 加載 notebooklm-config.json (動態build label)
   - 覆蓋過時的硬編碼值

2. 建立notebook
   標題："加密貨幣日報 YYYY-MM-DD"

3. 上傳text source
   內容：buildSourceText() (複用TTS邏輯)

4. 觸發Audio Overview生成
   自訂語言：zh-TW (繁體中文)

5. 輪詢等待完成
   - 超時：5分鐘
   - 輪詢間隔：5秒
   - 狀態檢查：artifact.state === ArtifactState.READY

6. 下載MP3至臨時目錄

7. 清理：刪除notebook (避免累積)

特點：
- 雙主持人對話風格
- MP3格式 (比WAV體積小)
- 自然語言，高品質

限制：
- NotebookLM配額限制
- 需外部認證（Google帳號）
```

#### 配置開關
```typescript
config.podcast.enabled:
  true  → 使用NotebookLM Podcast (format: mp3)
  false → 使用Gemini TTS (format: wav)
```

---

### 9. 配置管理 (config/)

#### 環境變數驗證

**必填變數**（啟動時檢查，缺一則拋出ConfigValidationError）
```
GEMINI_API_KEY       Google Gemini API密鑰
NEWSAPI_KEY          NewsAPI密鑰
SENDER_EMAIL          寄件者Email
EMAIL_RECIPIENTS      收件者（逗號分隔）
SMTP_USER             SMTP帳號
SMTP_PASS             SMTP密碼
```

**選填變數**（含默認值）
```
AI_MODEL              (default: gemini-2.5-flash-lite)
ENABLE_COINGECKO      (default: true)
ENABLE_COINDESK       (default: true)
ENABLE_MESSARI        (default: false)
MESSARI_API_KEY       (default: "")
ALERT_EMAIL           (default: "")
SMTP_HOST             (default: smtp.gmail.com)
SMTP_PORT             (default: 587)
TIMEZONE              (default: Asia/Taipei)
REPORT_HOUR           (default: 9)
DRY_RUN               (default: false)
LOG_LEVEL             (default: info)
NODE_ENV              (default: development)
GH_PAGES_TOKEN        (default: "")
GH_PAGES_OWNER        (default: "")
GH_PAGES_REPO         (default: "")
PODCAST_ENABLED       (default: false)
NOTEBOOKLM_EMAIL      (default: "")
NOTEBOOKLM_PASSWORD   (default: "")
NOTEBOOKLM_AUTH_TOKEN (default: "")
NOTEBOOKLM_COOKIES    (default: "")
```

#### 配置加載邏輯
```javascript
if (NODE_ENV !== 'production') {
  // 開發環境：載入.env檔案
  require('dotenv').config();
}

// 驗證必填變數 → 拋出ConfigValidationError
for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    throw new ConfigValidationError(key);
  }
}

// 匯出類型安全的config物件
export const config = { ... } as const;
```

---

## 技術棧

### 核心依賴
```json
{
  "@google/genai": "^1.48.0",              // Gemini 2.5 TTS
  "@google/generative-ai": "^0.21.0",      // Gemini API
  "@huggingface/transformers": "^3.8.1",   // Embedding模型
  "axios": "^1.6.0",                       // HTTP客户端
  "axios-retry": "^4.0.0",                 // HTTP自動重試
  "cheerio": "^1.2.0",                     // HTML解析
  "dotenv": "^16.4.0",                     // 環境變數
  "handlebars": "^4.7.0",                  // 模板引擎
  "node-cron": "^3.0.0",                   // 定時排程
  "nodemailer": "^6.9.0",                  // SMTP郵件
  "notebooklm-kit": "^2.2.0"               // NotebookLM API
}
```

### 開發依賴
```json
{
  "typescript": "^5.4.0",                  // 型別系統
  "vitest": "^1.6.0",                      // 測試框架
  "@vitest/coverage-v8": "^1.6.0",         // 覆蓋率
  "eslint": "^8.57.0",                     // 代碼檢查
  "prettier": "^3.2.0",                    // 代碼格式化
  "playwright": "^1.59.1",                 // 瀏覽器自動化
  "ts-node": "^10.9.0"                     // TS直接執行
}
```

### Node版本要求
```
>= 20.0.0
```

---

## 新增功能

### 最近的功能擴展

#### 1. NotebookLM Podcast支援
- **路徑**：`src/podcast/index.ts`
- **特性**：
  - 雙主持人對話格式
  - 繁體中文支援
  - 多重認證方式
  - 動態build label加載 (notebooklm-config.json)
  - 自動notebook清理

#### 2. Google Gemini TTS語音合成
- **路徑**：`src/tts/index.ts`
- **特性**：
  - 24kHz採樣率
  - WAV編碼
  - 分段合成（4000字符上限）
  - PCM → WAV轉碼邏輯

#### 3. 音檔管理
- **發布**：推送至GitHub (audio/ 目錄)
- **格式**：
  - TTS: .wav (16-bit PCM, 24kHz)
  - Podcast: .mp3

#### 4. 深度分析功能
- **機制**：`src/analyzer/deep-analyzer.ts`
- **範圍**：前6名重點新聞
- **內容**：
  - 原文全文抓取
  - 400-600字AI分析
  - 背景脈絡、市場影響、未來展望

---

## 錯誤處理機制

### 分層錯誤處理

#### 第1層：自訂錯誤類型
```typescript
// types/index.ts
class AllSourcesFailedError extends Error {
  // 所有新聞來源均失敗
}

class ConfigValidationError extends Error {
  // 環境變數缺失
}

// utils/retry.ts
class NonRetryableError extends Error {
  // 不應重試的錯誤（如AI安全篩選器）
}
```

#### 第2層：HTTP重試機制 (axios-retry)
```
策略：指數退避
  重試次數：3次
  延遲：1s → 2s → 4s
  
重試條件：
  - 網路錯誤
  - 5xx服務器錯誤
  - 429速率限制
  
記錄：每次重試均記錄日誌
```

#### 第3層：函數級重試 (withRetry)
```
用途：非HTTP API (Gemini呼叫)

簽名：
  withRetry<T>(
    fn: () => Promise<T>,
    options: {
      retries: number;
      delayMs: number;
      label?: string;
    }
  ): Promise<T>

特性：
  - 固定延遲（非指數）
  - NonRetryableError直接拋出
  - 詳細的重試日誌
```

#### 第4層：全域錯誤邊界 (main函數)
```typescript
async function main() {
  try {
    await runDailyPipeline();
  } catch (err) {
    logger.error('每日報告流程失敗', { err });
    await sendAlertEmail(err);  // 寄送警示Email
    process.exit(1);
  }
}
```

### 故障隔離 (Promise.allSettled)
```
好處：
- 單一來源失敗不中斷整體流程
- 記錄失敗原因，便於診斷
- 若所有來源失敗才拋出AllSourcesFailedError

使用場景：
- 收集器：多個新聞來源
- 未來可擴展：多個分析器調用等
```

### 回退機制
```
AI評分失敗 → classifyByKeywords (關鍵字備援)
深度分析失敗 → deepAnalysis = undefined
原文抓取失敗 → 用title + summary替代
語音合成失敗 → 報告仍可發布（無語音）
```

---

## 測試策略

### 測試結構
```
tests/
├── unit/                  # 單元測試
│   ├── collector-*.test.ts
│   ├── normalizer.test.ts
│   ├── deduplicator*.test.ts
│   ├── ranker.test.ts
│   ├── reporter.test.ts
│   ├── publisher.test.ts
│   ├── mailer.test.ts
│   ├── scheduler.test.ts
│   └── podcast.test.ts
├── integration/           # 整合測試
│   └── pipeline.test.ts   # 完整流程測試
├── e2e/                   # 端到端測試
│   └── full-pipeline.test.ts
└── helpers/
    └── mocks.ts           # 共用Mock數據
```

### 測試框架
- **框架**：Vitest
- **特性**：
  - 快速執行
  - ESM支援
  - 並行運行
  - 覆蓋率報告

### 測試原則
```
1. 外部API均mock
   - Gemini API mock應答
   - NewsAPI mock新聞列表
   - GitHub API mock推送結果

2. Config模組特殊處理
   - Mock以避免ConfigValidationError
   - 注入測試用環境變數

3. 端到端測試
   - 測試完整pipeline
   - 驗證各模塊協作

4. 覆蓋率目標
   - 核心流程：> 80%
   - 工具函數：> 70%
```

### 運行命令
```bash
pnpm test              # 單次執行
pnpm test:watch        # 監聽模式
pnpm test:coverage     # 含覆蓋率

# 單一測試檔案
pnpm vitest run tests/unit/normalizer.test.ts
```

---

## 部署與運行

### 開發環境

#### 1. 環境準備
```bash
# 複製配置
cp .env.example .env

# 編輯 .env，填入必要的API密鑰
GEMINI_API_KEY=your-key
NEWSAPI_KEY=your-key
...
```

#### 2. 依賴安裝
```bash
# 使用pnpm
pnpm install

# 或使用bun
bun install
```

#### 3. 開發運行
```bash
# 單次執行完整流程
pnpm dev

# 本地測試（跳過Email發送）
DRY_RUN=true pnpm dev

# 啟動長駐排程模式
ts-node src/scheduler/index.ts
```

### 生產環境

#### 1. 編譯
```bash
pnpm build
# 輸出：dist/

# build步驟：
# - TypeScript編譯
# - 複製Handlebars模板至dist
```

#### 2. 運行編譯版本
```bash
pnpm start
# 等同於：node dist/index.js
```

#### 3. 容器化（可選）
```dockerfile
# 示例Dockerfile（非提供，自行編寫）
FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
RUN npm run build
CMD ["npm", "start"]
```

#### 4. 排程執行
```bash
# 方式1：使用node-cron（內建排程器）
ts-node src/scheduler/index.ts
# 每日 09:00 Asia/Taipei 自動執行

# 方式2：外部排程（如 systemd timer / cron / K8s CronJob）
0 9 * * * /path/to/node dist/index.js
# UTC對應時刻：01:00 UTC
```

#### 5. 環境變數配置
```
# 生產環境：使用環境變數管理
export NODE_ENV=production
export GEMINI_API_KEY=***
export NEWSAPI_KEY=***
...
# dotenv 在生產環境下不被載入
```

### 監控與日誌

#### 日誌系統
```typescript
// src/utils/logger.ts
logger.info(msg, metadata)     // 信息級
logger.warn(msg, metadata)     // 警告級
logger.error(msg, metadata)    // 錯誤級
logger.debug(msg, metadata)    // 調試級

// 環境變數控制
LOG_LEVEL=debug|info|warn|error
```

#### Token追蹤
```typescript
// src/utils/token-tracker.ts
tokenTracker.track(model, inputTokens, outputTokens)
tokenTracker.logSummary()  // 流程結束時輸出統計
```

#### 推薦做法
```
1. 將日誌輸出至文件（或中央日誌系統）
2. 設置告警：
   - 所有來源失敗
   - AI API配額耗盡
   - Email發送失敗
3. 定期檢查去重歷史文件大小
```

---

## 總結

### 架構優勢
✅ **高可靠性**：多層重試、故障隔離、graceful fallback
✅ **高內聚性**：模塊化設計，職責清晰
✅ **易擴展性**：新聞來源、分析器、發布渠道均可插拔
✅ **生產就緒**：完整的錯誤處理、日誌、監控

### 技術亮點
✅ 語義去重：使用Embedding模型進行跨日去重
✅ 雙語音模式：TTS + Podcast選擇
✅ 多重認證：NotebookLM支援三種認證方式
✅ 動態配置：環境變數管理，啟動時驗證
✅ Token追蹤：Gemini API成本監控

### 後續改進方向
1. **數據持久化**：考慮遷移至數據庫（含去重歷史）
2. **性能優化**：並行度調整、cache策略
3. **分佈式**：支援多worker並行收集
4. **監控完善**：集成Sentry/DataDog等APM平台
5. **報告個性化**：按用戶興趣篩選新聞

---

**報告生成日期**：2026-04-10
**代碼版本**：基於最新commit分析
