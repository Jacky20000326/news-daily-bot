# 從零到一：透過加密貨幣日報系統學習資料工程實戰

> 本文以 `crypto-daily-news` 專案的真實程式碼為範例，逐步拆解一個完整 ETL + AI Pipeline 的設計思路與工程知識點。

---

## 目錄

1. [全局觀：什麼是 ETL Pipeline](#1-全局觀什麼是-etl-pipeline)
2. [專案骨架：TypeScript 工程配置](#2-專案骨架typescript-工程配置)
3. [組態管理：Config 模組設計](#3-組態管理config-模組設計)
4. [資料收集層（Extract）：多源並行收集](#4-資料收集層extract多源並行收集)
5. [資料清洗層（Transform-1）：標準化](#5-資料清洗層transform-1標準化)
6. [資料去重層（Transform-2）：URL + NLP 去重](#6-資料去重層transform-2url--nlp-去重)
7. [AI 分析層（Transform-3）：批次評分與摘要](#7-ai-分析層transform-3批次評分與摘要)
8. [報告生成層（Load-1）：模板引擎](#8-報告生成層load-1模板引擎)
9. [輸出層（Load-2）：Email + GitHub Pages](#9-輸出層load-2email--github-pages)
10. [橫切關注點：日誌、重試、排程](#10-橫切關注點日誌重試排程)
11. [型別系統設計：資料如何在 Pipeline 中流轉](#11-型別系統設計資料如何在-pipeline-中流轉)
12. [設計模式總結與延伸閱讀](#12-設計模式總結與延伸閱讀)

---

## 1. 全局觀：什麼是 ETL Pipeline

ETL 是資料工程的核心概念：

| 階段 | 意義 | 本專案對應 |
|------|------|-----------|
| **E**xtract（提取） | 從外部來源拉取原始資料 | `collector/` — NewsAPI、CryptoPanic、RSS |
| **T**ransform（轉換） | 清洗、標準化、加值處理 | `normalizer/` → `deduplicator/` → `analyzer/` |
| **L**oad（載入） | 輸出到目標系統 | `reporter/` → `mailer/` + `publisher/` |

本專案的 Pipeline 定義在 `src/index.ts`：

```typescript
// src/index.ts — 主流程（簡化版）
export async function runDailyPipeline(): Promise<DailyReport> {
  const timeWindow = getReportTimeWindow();          // 決定資料範圍
  const rawItems = await collect(timeWindow);         // E: 收集
  const normalizedItems = normalize(rawItems, timeWindow); // T1: 標準化
  const dedupResult = deduplicate(normalizedItems);   // T2: 去重
  const analyzedItems = await analyze(dedupResult.items);  // T3: AI 分析
  // ... 組裝報告、發送
}
```

### 知識點：為什麼要用函式串接而不是 class？

這裡採用的是 **函式組合（Function Composition）** 風格，而非 OOP 的 class 繼承。好處是：

- 每個函式純粹做一件事，輸入輸出明確
- 容易單獨測試任何一個步驟
- 容易替換（例如把 AI provider 從 Claude 換成 Gemini，只改 `analyzer/`）

---

## 2. 專案骨架：TypeScript 工程配置

### 2.1 package.json 的依賴分層

```json
{
  "dependencies": {
    "@google/generative-ai": "^0.21.0",  // AI 分析
    "axios": "^1.6.0",                    // HTTP 請求
    "axios-retry": "^4.0.0",              // HTTP 重試
    "handlebars": "^4.7.0",               // 模板引擎
    "natural": "^6.0.0",                  // NLP（TF-IDF）
    "node-cron": "^3.0.0",                // 排程
    "nodemailer": "^6.9.0",               // Email
    "rss-parser": "^3.13.0"               // RSS 解析
  },
  "devDependencies": {
    // TypeScript、ESLint、Prettier、Vitest...
  }
}
```

### 知識點：dependencies vs devDependencies

| 類型 | 何時需要 | 範例 |
|------|---------|------|
| `dependencies` | 執行時需要 | axios、nodemailer |
| `devDependencies` | 只在開發/測試時需要 | typescript、vitest、eslint |

在 production 部署時執行 `npm install --production` 只會安裝 `dependencies`，減少部署體積。

### 2.2 scripts 設計

```json
{
  "scripts": {
    "dev": "ts-node src/index.ts",     // 開發：直接跑 TypeScript
    "build": "tsc",                     // 編譯：TypeScript → JavaScript
    "start": "node dist/index.js"       // 生產：跑編譯後的 JS
  }
}
```

### 知識點：ts-node vs tsc + node

- `ts-node`：即時編譯執行，適合開發（慢但方便）
- `tsc` → `node`：先編譯再執行，適合生產（快但需要 build step）

---

## 3. 組態管理：Config 模組設計

```typescript
// src/config/index.ts

// 1) 僅在非 production 環境載入 .env 檔
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// 2) 啟動時驗證必要環境變數
const REQUIRED_VARS = [
  'GEMINI_API_KEY', 'NEWSAPI_KEY', 'SENDER_EMAIL',
  'EMAIL_RECIPIENTS', 'SMTP_USER', 'SMTP_PASS',
] as const;

for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    throw new ConfigValidationError(key);
  }
}

// 3) 統一導出設定物件
export const config = {
  ai: {
    apiKey: process.env.GEMINI_API_KEY!,
    model: process.env.AI_MODEL ?? 'gemini-1.5-flash',  // 提供預設值
    maxTokens: 4096,
    temperature: 0.3,
  },
  // ...
} as const;
```

### 知識點 A：Fail Fast 原則

```typescript
for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    throw new ConfigValidationError(key);  // 缺必要變數 → 立即中斷
  }
}
```

系統在**啟動階段**就驗證所有必要設定。如果缺少任何一項，立刻拋出錯誤並終止。

為什麼這很重要？想像另一種情況：系統啟動後跑了 5 分鐘的收集和分析，到了寄信階段才發現沒有 SMTP 密碼——前面的工作全部浪費。**Fail Fast 把錯誤提前到最早的時機點暴露出來。**

### 知識點 B：as const 斷言

```typescript
export const config = { ... } as const;
```

`as const` 讓 TypeScript 將物件推斷為**深層唯讀字面量型別**：

```typescript
// 沒有 as const：型別是 string
config.ai.model  // type: string

// 有 as const：型別是字面量
config.ai.model  // type: "gemini-1.5-flash"
```

好處：防止意外修改設定值，同時讓型別推斷更精確。

### 知識點 C：環境分離

```typescript
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
```

- 開發環境：從 `.env` 檔讀取（方便）
- 生產環境：從系統環境變數讀取（安全，不把密鑰放檔案裡）

---

## 4. 資料收集層（Extract）：多源並行收集

### 4.1 策略模式：來源定義

```typescript
// src/collector/index.ts

interface SourceDefinition {
  name: SourceType;
  enabled: boolean;
  fetch: (timeWindow: TimeWindow) => Promise<RawNewsItem[]>;
}

const sources: SourceDefinition[] = [
  { name: 'newsapi',     enabled: true,                    fetch: fetchNewsAPI },
  { name: 'cryptopanic', enabled: true,                    fetch: fetchCryptoPanic },
  { name: 'rss',         enabled: config.sources.enableRss, fetch: fetchRSSFeeds },
];
```

### 知識點：策略模式（Strategy Pattern）

每個來源都實作相同的介面 `(timeWindow: TimeWindow) => Promise<RawNewsItem[]>`。這帶來兩個好處：

1. **新增來源零改動**：只需在陣列中加一行，不需改核心邏輯
2. **可動態啟停**：`enabled` 欄位由設定控制

```typescript
// 假設未來要加 Twitter 來源，只需：
{ name: 'twitter', enabled: config.sources.enableTwitter, fetch: fetchTwitter }
```

### 4.2 Promise.allSettled：部分失敗不中斷

```typescript
// src/collector/index.ts

const settledResults = await Promise.allSettled(
  enabledSources.map((source) => source.fetch(timeWindow)),
);

for (let i = 0; i < settledResults.length; i++) {
  const result = settledResults[i];
  if (result.status === 'fulfilled') {
    allItems.push(...result.value);   // 成功：收集結果
  } else {
    logger.warn('來源收集失敗', { ... }); // 失敗：記錄但不中斷
  }
}

// 只有全部失敗才拋出錯誤
if (successCount === 0 && failureCount > 0) {
  throw new AllSourcesFailedError();
}
```

### 知識點：Promise.all vs Promise.allSettled

| 方法 | 行為 | 適用場景 |
|------|------|---------|
| `Promise.all` | 任一失敗 → 整體失敗 | 所有結果都必須成功 |
| `Promise.allSettled` | 等所有結束，不論成敗 | 部分失敗可接受 |

這裡用 `allSettled` 是正確選擇：NewsAPI 掛了不代表 RSS 的資料也不能用。

### 4.3 具體來源實作：以 NewsAPI 為例

```typescript
// src/collector/newsapi.ts

export async function fetchNewsAPI(timeWindow: TimeWindow): Promise<RawNewsItem[]> {
  const results: RawNewsItem[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await httpClient.get<NewsAPIResponse>(NEWSAPI_ENDPOINT, {
      params: {
        q: 'bitcoin OR ethereum OR crypto OR cryptocurrency OR blockchain OR DeFi OR NFT',
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 100,
        page,
        from: timeWindow.from.toISOString(),
        to: timeWindow.to.toISOString(),
      },
    });

    // ... 處理回應，轉換為 RawNewsItem

    // 提前停止分頁的優化
    if (publishedDate < timeWindow.from) {
      hasMore = false;  // 已超過時間窗下界，不需再翻頁
    }
  }
  return results;
}
```

### 知識點：分頁策略與提前終止

API 回傳的資料按時間排序，一旦遇到比時間窗更早的文章，就不需要繼續翻頁了。這是一個常見的**分頁優化技巧**：

```
第 1 頁：[今天 08:00, 07:30, 07:00, ...]  ← 全部在窗口內
第 2 頁：[06:00, 05:30, ...]              ← 還在窗口內
第 3 頁：[23:00(昨天), 22:00, ...]        ← 碰到窗口下界，停止
```

不做這個優化的話，可能會無謂地翻完所有頁面。

### 4.4 RSS 來源：子層級的 Promise.allSettled

```typescript
// src/collector/rss.ts

const DEFAULT_FEEDS: FeedDefinition[] = [
  { name: 'CoinDesk',         url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'CoinTelegraph',    url: 'https://cointelegraph.com/rss' },
  { name: 'The Block',        url: 'https://www.theblock.co/rss.xml' },
  { name: 'Decrypt',          url: 'https://decrypt.co/feed' },
  { name: 'Bitcoin Magazine',  url: 'https://bitcoinmagazine.com/.rss/full/' },
];

export async function fetchRSSFeeds(timeWindow: TimeWindow): Promise<RawNewsItem[]> {
  const settledResults = await Promise.allSettled(
    DEFAULT_FEEDS.map((feed) => fetchSingleFeed(feed, timeWindow)),
  );
  // ... 同樣的 fulfilled/rejected 處理
}
```

### 知識點：雙層容錯設計

```
收集層（collector/index.ts）
  ├── NewsAPI          ← Promise.allSettled 第一層
  ├── CryptoPanic      ← 單一來源失敗不影響整體
  └── RSS Feeds        ← Promise.allSettled 第一層
       ├── CoinDesk       ← Promise.allSettled 第二層
       ├── CoinTelegraph   ← 單一 feed 失敗不影響 RSS 整體
       ├── The Block
       ├── Decrypt
       └── Bitcoin Magazine
```

這是**兩層 Promise.allSettled 嵌套**。即使 CoinDesk 的 RSS 掛了，其他 4 個 feed 的結果照樣收集。即使整個 RSS 來源掛了，NewsAPI 的結果照樣使用。

---

## 5. 資料清洗層（Transform-1）：標準化

```typescript
// src/normalizer/index.ts

export function normalize(items: RawNewsItem[], timeWindow: TimeWindow): NewsItem[] {
  const results: NewsItem[] = [];
  let skippedNoTitle = 0;
  let skippedInvalidUrl = 0;
  let skippedInvalidDate = 0;
  let skippedOutOfWindow = 0;

  for (const item of items) {
    if (!item.title || !item.title.trim()) { skippedNoTitle++; continue; }
    if (!item.url || !isValidUrl(item.url)) { skippedInvalidUrl++; continue; }

    const publishedAt = parsePublishedAt(item.publishedAt);
    if (publishedAt === null) { skippedInvalidDate++; continue; }
    if (publishedAt < timeWindow.from || publishedAt > timeWindow.to) {
      skippedOutOfWindow++; continue;
    }

    results.push({
      id: generateId(item.url),     // SHA-256(url) 前 16 字元
      url: item.url,
      title: item.title.trim(),
      content: buildContent(item),   // 無全文時合併 title + summary
      publishedAt,
      sourceName: item.sourceName,
      sourceType: item.source,
      tags: normalizeTags(item.tags), // 小寫、去空白
    });
  }

  // 記錄每種跳過原因的數量
  logger.info('標準化完成', {
    inputCount: items.length, outputCount: results.length,
    skippedNoTitle, skippedInvalidUrl, skippedInvalidDate, skippedOutOfWindow,
  });

  return results;
}
```

### 知識點 A：防禦性過濾鏈

標準化模組實作了一個**多層過濾管線**，每一層檢查一個條件：

```
輸入 RawNewsItem
  │
  ├─ 標題為空？ → 跳過
  ├─ URL 無效？ → 跳過
  ├─ 時間無法解析？ → 跳過
  ├─ 不在時間窗內？ → 跳過
  │
  └─ 全部通過 → 轉換為 NewsItem
```

關鍵是**每種跳過原因都有獨立計數器**（`skippedNoTitle`、`skippedInvalidUrl` 等），最後一次性記錄到日誌。這讓你在生產環境中能快速診斷「為什麼收集了 200 筆但只剩 80 筆？」

### 知識點 B：確定性 ID 生成

```typescript
function generateId(url: string): string {
  return createHash('sha256').update(url, 'utf8').digest('hex').slice(0, 16);
}
```

用 SHA-256 雜湊 URL 生成 ID，取前 16 個 hex 字元（64 bit）。這個設計有幾個特性：

| 特性 | 說明 |
|------|------|
| **確定性** | 同一個 URL 永遠產生同一個 ID |
| **無狀態** | 不需要資料庫或計數器 |
| **碰撞率極低** | 16 hex = 64 bit，2^32（約 43 億）筆資料才有 50% 碰撞機率 |
| **URL 安全** | 純 hex 字元，可直接用在 HTML anchor |

### 知識點 C：content 合併策略

```typescript
function buildContent(item: RawNewsItem): string {
  if (item.content && item.content.trim()) {
    return item.content.trim();  // 有全文用全文
  }
  const parts: string[] = [item.title];
  if (item.summary && item.summary.trim()) {
    parts.push(item.summary.trim());  // 無全文用 title + summary
  }
  return parts.join(' ');
}
```

不同來源的資料完整度差異很大：
- NewsAPI 有 `content`（但通常被截斷）
- CryptoPanic 只有 `title`
- RSS 有些有 `content:encoded`（全文），有些只有 `contentSnippet`

`buildContent` 用**降級策略**確保每筆資料都至少有一些文字內容可供後續 AI 分析使用。

---

## 6. 資料去重層（Transform-2）：URL + NLP 去重

### 6.1 第一階段：URL 正規化去重

```typescript
// src/deduplicator/index.ts

function normalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl.toLowerCase().replace(/\/$/, '');
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  // 移除追蹤用參數
  const TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
    'utm_content', 'utm_id', 'fbclid', 'gclid', 'ref', 'referrer', 'source',
  ];
  for (const param of TRACKING_PARAMS) {
    url.searchParams.delete(param);
  }

  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}
```

### 知識點：URL 正規化（Canonicalization）

同一篇新聞可能以不同的 URL 出現在不同來源：

```
https://coindesk.com/article/bitcoin-etf?utm_source=twitter
https://CoinDesk.com/article/bitcoin-etf?utm_source=rss&utm_medium=feed
https://coindesk.com/article/bitcoin-etf/
```

正規化後全部變成：

```
https://coindesk.com/article/bitcoin-etf
```

處理步驟：
1. scheme + hostname → 小寫
2. 移除 UTM 等追蹤參數
3. 移除尾端斜線

### 6.2 第二階段：TF-IDF + Cosine Similarity 去重

```typescript
// src/deduplicator/index.ts

export function deduplicateByTitle(items: NewsItem[]): NewsItem[] {
  const BATCH_SIZE = 50;
  const SIMILARITY_THRESHOLD = 0.85;
  const keptItems: NewsItem[] = [];

  for (let batchStart = 0; batchStart < items.length; batchStart += BATCH_SIZE) {
    const batch = items.slice(batchStart, batchStart + BATCH_SIZE);

    // 將已保留項目 + 新批次合併建 TF-IDF 模型
    const allForTfidf = [...keptItems, ...batch];
    const tfidf = new TfIdf();
    for (const item of allForTfidf) {
      tfidf.addDocument(item.title.toLowerCase());
    }

    // 取得已保留項目的向量
    const initialKeptCount = keptItems.length;
    const keptVectors = keptItems.map((_, idx) => getDocumentVector(tfidf, idx));

    for (let i = 0; i < batch.length; i++) {
      const candidateVec = getDocumentVector(tfidf, initialKeptCount + i);
      let isDuplicate = false;

      for (let j = 0; j < keptItems.length; j++) {
        const similarity = cosineSimilarity(candidateVec, keptVectors[j]);
        if (similarity > SIMILARITY_THRESHOLD) {
          // 重複！保留較早發佈的那筆
          if (batch[i].publishedAt < keptItems[j].publishedAt) {
            keptItems[j] = batch[i];
            keptVectors[j] = candidateVec;
          }
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        keptItems.push(batch[i]);
        keptVectors.push(candidateVec);
      }
    }
  }
  return keptItems;
}
```

### 知識點 A：TF-IDF 是什麼

TF-IDF（Term Frequency - Inverse Document Frequency）是一種文字向量化方法：

```
TF（詞頻）= 該詞在文件中出現的次數 / 文件總詞數
IDF（逆文件頻率）= log(總文件數 / 包含該詞的文件數)
TF-IDF = TF × IDF
```

核心思想：**一個詞如果在某篇文件中頻繁出現，但在其他文件中很少見，那它對這篇文件的辨識度就很高。**

例如：
- "Bitcoin" 在所有新聞中都出現 → IDF 低 → TF-IDF 低（不具辨識力）
- "Solana Saga" 只在少數新聞中出現 → IDF 高 → TF-IDF 高（具辨識力）

### 知識點 B：Cosine Similarity 是什麼

將兩篇文件的 TF-IDF 向量做餘弦相似度計算：

```typescript
function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dotProduct = 0;  // 內積
  let normA = 0;       // A 的長度平方
  let normB = 0;       // B 的長度平方

  for (const [term, scoreA] of vecA) {
    const scoreB = vecB.get(term) ?? 0;
    dotProduct += scoreA * scoreB;
    normA += scoreA * scoreA;
  }
  for (const [, scoreB] of vecB) {
    normB += scoreB * scoreB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
```

結果範圍 0～1：
- **1.0** = 完全相同
- **0.85**（本專案閾值）= 標題非常相似，幾乎是同一則新聞
- **0.0** = 完全不相關

為什麼用 0.85 而不是 0.95？因為同一則新聞在不同來源的標題會略有差異：

```
CoinDesk: "Bitcoin Surges Past $50K as ETF Inflows Hit Record"
CoinTelegraph: "BTC Breaks $50,000 — ETF Inflows Reach All-Time High"
```

這兩篇是同一事件的報導，但標題文字不完全相同。0.85 的閾值能捕捉到這種「語意重複」。

### 知識點 C：批次處理控制記憶體

為什麼要分批 50 筆？因為 TF-IDF 矩陣大小 = 文件數 × 詞彙數。如果把 500 篇新聞全部放進一個 TF-IDF 模型，記憶體消耗會很大。分批處理是一種**空間複雜度優化**。

但這裡有個取捨：每批都要跟「所有已保留項目」重新建模，隨著保留數增長，計算量仍然是 O(n²)。對數百筆新聞來說足夠，但如果規模到萬筆就需要改用 LSH（Locality-Sensitive Hashing）等近似演算法。

---

## 7. AI 分析層（Transform-3）：批次評分與摘要

### 7.1 Prompt Engineering：結構化評分請求

```typescript
// src/analyzer/prompts/ranking.ts

export function buildRankingPrompt(items: NewsItem[]): string {
  const newsData = items.map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content.slice(0, 500),  // 截斷至 500 字，控制 token 成本
  }));

  return `你是一位專業的加密貨幣市場分析師...

## 評分標準
| 分數 | 說明 |
|------|------|
| 9-10 | 對整體市場或產業有重大影響 |
| 7-8  | 對特定幣種或領域有顯著影響 |
...

## 待分析新聞
\`\`\`json
${JSON.stringify(newsData, null, 2)}
\`\`\`

## 輸出要求
請只回傳 JSON 陣列...`;
}
```

### 知識點：Prompt Engineering 四要素

這個 prompt 示範了結構化 prompt 的四個要素：

| 要素 | 本專案實作 |
|------|-----------|
| **角色設定** | 「你是一位專業的加密貨幣市場分析師」 |
| **任務定義** | 表格化的評分標準、分類定義 |
| **輸入格式** | JSON 結構化資料，帶 id 以便對照 |
| **輸出約束** | 「請只回傳 JSON 陣列，不得包含任何額外說明」 |

特別注意 `content.slice(0, 500)` — 這是**成本控制**的關鍵。Gemini 按 token 計費，不需要把完整文章都送進去，前 500 字已足夠讓 AI 理解新聞重點。

### 7.2 AI 回應解析與驗證

```typescript
// src/analyzer/ranker.ts

function parseRankingResponse(responseText: string): RawRankingItem[] {
  // AI 有時會在 JSON 外包 markdown 程式碼區塊
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error('AI 回傳格式不是陣列');
  }
  return parsed;
}

function validateRankingItem(raw: RawRankingItem): RankingResult {
  // 分數不在 1-10 範圍 → 退回預設值 5
  const importanceScore =
    typeof raw.importanceScore === 'number' &&
    raw.importanceScore >= 1 && raw.importanceScore <= 10
      ? Math.round(raw.importanceScore)
      : FALLBACK_SCORE;

  // 分類不合法 → 退回 'other'
  const category = isValidCategory(raw.category) ? raw.category : 'other';

  // 情緒不合法 → 退回 'neutral'
  const sentiment = isValidSentiment(raw.sentiment) ? raw.sentiment : 'neutral';

  return { importanceScore, category, relatedTickers, sentiment };
}
```

### 知識點：永遠不要信任 AI 的輸出格式

AI 回應有三種常見問題：

1. **包裹 markdown**：AI 常在 JSON 前後加 ` ```json ` 標記
2. **欄位缺失或型別錯誤**：分數可能是字串 `"8"` 而不是數字 `8`
3. **值域超出預期**：分數可能是 11 或 -1

本專案的防禦策略：

```
AI 回應文字
  │
  ├── 移除 markdown 包裹
  ├── JSON.parse（可能失敗 → 拋出錯誤 → 觸發重試）
  ├── 驗證是否為陣列
  └── 逐筆驗證每個欄位
       ├── importanceScore: 不在 1-10 → 預設 5
       ├── category: 不合法 → 預設 'other'
       └── sentiment: 不合法 → 預設 'neutral'
```

### 7.3 批次處理與備援機制

```typescript
// src/analyzer/ranker.ts

async function processBatch(model, batch, batchIndex): Promise<Map<string, RankingResult>> {
  try {
    // 嘗試 AI 分析
    const rawItems = await withRetry(async () => {
      const result = await model.generateContent(prompt);
      return parseRankingResponse(safeGetText(result));
    }, { retries: 2, delayMs: 2000 });

    // 成功：逐筆驗證並填入結果
    for (const item of batch) {
      const rawItem = rawItemMap.get(item.id);
      if (rawItem) {
        resultMap.set(item.id, validateRankingItem(rawItem));
      } else {
        // AI 漏掉某筆 → 關鍵字備援
        resultMap.set(item.id, {
          importanceScore: 5,
          category: classifyByKeywords(item),
          relatedTickers: [],
          sentiment: 'neutral',
        });
      }
    }
  } catch (err) {
    // 整批失敗 → 全部用關鍵字備援
    for (const item of batch) {
      resultMap.set(item.id, {
        importanceScore: 5,
        category: classifyByKeywords(item),
        relatedTickers: [],
        sentiment: 'neutral',
      });
    }
  }
}
```

### 知識點：三層降級策略

```
層級 1：AI 正常回應 → 使用 AI 結果（最佳品質）
層級 2：AI 漏掉某筆 → 該筆用關鍵字備援（部分降級）
層級 3：整批 AI 失敗 → 全部用關鍵字備援（完全降級）
```

關鍵字備援的實作：

```typescript
// src/analyzer/prompts/classification.ts

const KEYWORD_MAP: Record<NewsCategory, string[]> = {
  market:     ['price', 'rally', 'dump', 'ath', 'bull', 'bear'],
  regulation: ['sec', 'regulation', 'ban', 'legal', 'government'],
  security:   ['hack', 'exploit', 'stolen', 'phishing'],
  // ...
};

// 按優先順序匹配（security 優先於 market，避免 "hack" 被誤分類）
const PRIORITY_ORDER: NewsCategory[] = [
  'security', 'regulation', 'macro', 'defi', 'nft',
  'exchange', 'technology', 'market', 'other',
];
```

注意 `PRIORITY_ORDER` 的設計：security 排在最前面，因為「交易所遭駭」這類新聞可能同時包含 "exchange" 和 "hack" 關鍵字，應優先歸類為安全事件。

### 7.4 並行度控制：手寫 Promise Pool

```typescript
// src/analyzer/summarizer.ts

const CONCURRENCY_LIMIT = 2;  // Gemini 免費層 15 RPM，限制並行

async function promisePool<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let currentIndex = 0;

  async function runNext(): Promise<void> {
    while (currentIndex < tasks.length) {
      const taskIndex = currentIndex;
      currentIndex++;
      results[taskIndex] = await tasks[taskIndex]();
    }
  }

  // 啟動 limit 個 worker，每個 worker 持續消費任務
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => runNext()
  );
  await Promise.all(workers);

  return results;
}
```

### 知識點：Worker Pool 模式

這是一個經典的**有限並行**實作：

```
任務佇列：[摘要1, 摘要2, 摘要3, 摘要4, 摘要5, 摘要6]

Worker A: 取摘要1 → 完成 → 取摘要3 → 完成 → 取摘要5 → 完成
Worker B: 取摘要2 → 完成 → 取摘要4 → 完成 → 取摘要6 → 完成
```

為什麼不用 `Promise.all` 直接並行全部？因為 Gemini 免費層有 15 RPM 限制。如果 6 筆摘要同時發出，可能觸發 rate limit。限制為 2 個並行，確保請求速率在安全範圍內。

`currentIndex` 作為共享游標，`runNext` 作為 worker 循環消費——這個模式在 Node.js 中很實用，因為 JavaScript 是單線程的，不需要 mutex。

---

## 8. 報告生成層（Load-1）：模板引擎

### 8.1 Handlebars 模板引擎

```typescript
// src/reporter/index.ts

// 註冊自訂 helper
Handlebars.registerHelper('eq',  (a, b) => a === b);
Handlebars.registerHelper('gte', (a, b) => a >= b);
Handlebars.registerHelper('lte', (a, b) => a <= b);
Handlebars.registerHelper('lt',  (a, b) => a < b);
Handlebars.registerHelper('and', (a, b) => a && b);

// 模板快取（首次載入後不再讀取檔案）
let compiledTemplate: HandlebarsTemplateDelegate | null = null;

function getCompiledTemplate(): HandlebarsTemplateDelegate {
  if (compiledTemplate !== null) return compiledTemplate;

  const templatePath = path.join(__dirname, 'templates', 'daily-report.hbs');
  const templateSource = fs.readFileSync(templatePath, 'utf-8');
  compiledTemplate = Handlebars.compile(templateSource);
  return compiledTemplate;
}
```

### 知識點 A：模板快取模式

```typescript
let compiledTemplate = null;

function getCompiledTemplate() {
  if (compiledTemplate !== null) return compiledTemplate;  // 快取命中
  compiledTemplate = Handlebars.compile(readFile());        // 首次編譯
  return compiledTemplate;
}
```

這是**惰性初始化（Lazy Initialization）+ 單例快取**的經典模式。Handlebars 的 `compile` 需要解析模板語法，有一定的計算成本。快取後避免重複編譯。

### 知識點 B：資料準備層——不要把邏輯放在模板裡

```typescript
// src/reporter/index.ts

export function generateReport(report: DailyReport): string {
  const template = getCompiledTemplate();

  // 在 TypeScript 中準備好所有資料，而非在模板中做複雜邏輯
  const topStories = report.topStories.map(formatItem);

  const topStoryIds = new Set(report.topStories.map((s) => s.id));
  const allStoriesByImportance = Object.values(report.categorizedStories)
    .flat()
    .sort((a, b) => b.importanceScore - a.importanceScore)
    .map((item) => ({
      ...formatItem(item),
      // 有 AI 摘要的用錨點連結，其餘直連原始 URL
      detailLink: topStoryIds.has(item.id) ? `#story-${item.id}` : item.url,
    }));

  return template(templateData);
}
```

模板引擎的最佳實踐：**模板只負責呈現，邏輯在 code 裡處理。** 這裡的 `detailLink` 判斷、排序、格式化全部在 TypeScript 中完成，模板只需要 `{{detailLink}}` 直接輸出。

### 8.2 純文字備援

```typescript
// src/reporter/index.ts

export function buildPlainText(report: DailyReport): string {
  const lines: string[] = [];
  lines.push(`加密貨幣日報 ${report.reportDate}`);
  lines.push('='.repeat(50));
  // ...
  return lines.join('\n');
}
```

### 知識點：Email 的 text/plain 備援

Email 標準要求同時提供 HTML 和純文字版本。有些收件者的 email client 不支援 HTML（如純文字終端機 client），或用戶偏好設定為純文字模式。`buildPlainText` 確保這些情境下報告仍可閱讀。

---

## 9. 輸出層（Load-2）：Email + GitHub Pages

### 9.1 GitHub Pages 發布

```typescript
// src/publisher/index.ts

export async function publishToGitHubPages(html: string, dateStr: string) {
  // 1. 確保 GitHub Pages 已啟用
  await ensureGitHubPagesEnabled();

  // 2. 推送報告 HTML
  await pushFile(
    `crypto-daily-${dateStr}.html`,
    html,
    `report: 加密貨幣每日報告 ${dateStr}`
  );

  // 3. 更新 index.html 轉址
  await pushFile('index.html', buildIndexHtml(dateStr, pageUrl), '...');
}

// 透過 GitHub Contents API 推送檔案
async function pushFile(path: string, content: string, message: string) {
  const sha = await getFileSha(path);  // 取得現有檔案的 SHA（若存在）
  await httpClient.put(
    `${repoApiBase()}/contents/${path}`,
    {
      message,
      content: Buffer.from(content).toString('base64'),
      ...(sha ? { sha } : {}),  // 更新現有檔案需要 SHA
    },
    { headers: buildHeaders() }
  );
}
```

### 知識點：GitHub Contents API 的 SHA 機制

GitHub API 更新檔案時需要提供現有檔案的 SHA（版本識別碼）。這是一種**樂觀鎖（Optimistic Locking）**：

```
1. GET /contents/report.html → 取得 sha: "abc123"
2. PUT /contents/report.html → 帶上 sha: "abc123"
   → 如果中間有人改過檔案，sha 不匹配，API 會拒絕（409 Conflict）
```

本專案的實作：
- 檔案存在 → 取得 sha → 更新
- 檔案不存在 → sha 為 undefined → 建立新檔

### 9.2 通知信設計：導流而非內嵌

```typescript
// src/mailer/index.ts

function buildNotificationHtml(report: DailyReport): string {
  // 精簡通知信：頭條列表 + 閱讀完整報告按鈕
  const reportLink = mdReportUrl
    ? `<a href="${mdReportUrl}" ...>閱讀完整報告 →</a>`
    : '';
  // ...
}
```

### 知識點：Email 設計的取捨

為什麼不把完整報告直接塞進 Email？

| 方案 | 優點 | 缺點 |
|------|------|------|
| 完整報告嵌入 Email | 一封信看完 | 信件體積大、CSS 相容性問題多、Gmail 會截斷超長信件 |
| 通知信 + 連結 | 信件輕量、排版自由 | 需要額外的託管服務（GitHub Pages） |

本專案選擇後者：Email 只放頭條摘要，完整報告導流到 GitHub Pages。這是更成熟的做法。

---

## 10. 橫切關注點：日誌、重試、排程

### 10.1 結構化日誌

```typescript
// src/utils/logger.ts

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[getCurrentLevel()]) return;  // 層級過濾

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
  };

  console.log(JSON.stringify(entry));  // JSON 格式輸出
}
```

### 知識點：為什麼用 JSON 而不是 console.log？

```
// 非結構化（難以機器解析）
[2024-01-15 09:00:00] INFO: 收集完成，共 150 筆

// 結構化 JSON（機器可解析、可查詢）
{"timestamp":"2024-01-15T01:00:00.000Z","level":"info","message":"收集完成","context":{"rawCount":150}}
```

JSON 日誌可以直接被 ELK Stack、CloudWatch Logs、Datadog 等日誌系統解析。你可以用 SQL-like 查詢：

```sql
-- 找出所有失敗的來源
SELECT context.source FROM logs WHERE level = 'warn' AND message LIKE '%收集失敗%'
```

### 10.2 分層重試機制

```typescript
// src/utils/retry.ts

// HTTP 層：axios-retry（指數退避）
axiosRetry(httpClient, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,  // 1s → 2s → 4s
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    error.response?.status === 429,  // Rate limit
});

// 業務層：withRetry（固定間隔 + rate limit 加長等待）
export async function withRetry<T>(fn, options): Promise<T> {
  for (let attempt = 1; attempt <= options.retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof NonRetryableError) throw err;  // 不可重試 → 直接拋出

      const waitMs = isRateLimitError(err)
        ? options.delayMs * 15   // Rate limit → 等更久（2s × 15 = 30s）
        : options.delayMs;       // 一般錯誤 → 正常等待
      await delay(waitMs);
    }
  }
  throw lastError;
}
```

### 知識點 A：指數退避（Exponential Backoff）

```
第 1 次重試：等 1 秒
第 2 次重試：等 2 秒
第 3 次重試：等 4 秒
```

為什麼不用固定間隔？因為如果伺服器過載，所有 client 同時用固定間隔重試會造成「重試風暴」。指數退避讓後續重試越等越久，給伺服器喘息的空間。

### 知識點 B：NonRetryableError 模式

```typescript
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

// 使用場景：Gemini 安全篩選器攔截
if (finishReason === 'SAFETY') {
  throw new NonRetryableError('Gemini 拒絕生成內容');
}
```

不是所有錯誤都值得重試：
- 網路超時 → 重試有意義
- Rate limit → 等久一點再重試
- 安全篩選器攔截 → 重試 100 次結果也一樣，直接放棄

`NonRetryableError` 用型別系統來區分這兩種情況，讓 `withRetry` 遇到這類錯誤時立即拋出、不浪費重試次數。

### 10.3 排程器

```typescript
// src/scheduler/index.ts

const cronExpression = `0 ${config.scheduler.reportHour} * * *`;
// 預設：0 9 * * * = 每天 09:00

cron.schedule(cronExpression, async () => {
  try {
    await runDailyPipeline();
  } catch (err) {
    logger.error('排程執行失敗', { err: String(err) });
  }
}, {
  timezone: config.scheduler.timezone,  // Asia/Taipei
});
```

### 知識點：Cron 表達式

```
┌──── 分鐘（0-59）
│ ┌── 小時（0-23）
│ │ ┌── 日（1-31）
│ │ │ ┌── 月（1-12）
│ │ │ │ ┌── 星期幾（0-7，0 和 7 都是週日）
│ │ │ │ │
0 9 * * *   → 每天 09:00
```

`node-cron` 搭配 `timezone` 參數，確保在台北時間 09:00 觸發，不受伺服器所在時區影響。

---

## 11. 型別系統設計：資料如何在 Pipeline 中流轉

```typescript
// src/types/index.ts

// 第一層：原始資料（來自外部 API，欄位可能缺失）
interface RawNewsItem {
  source: SourceType;
  url: string;
  title: string;
  content?: string;       // 可選
  summary?: string;       // 可選
  publishedAt: string;    // 字串格式（各來源不同）
}

// 第二層：標準化後（欄位已驗證、格式統一）
interface NewsItem {
  id: string;             // 生成的確定性 ID
  url: string;
  title: string;
  content: string;        // 必有值（由 buildContent 保證）
  publishedAt: Date;      // 已轉為 Date 物件
  tags: string[];          // 必有值（空陣列也是合法值）
}

// 第三層：AI 分析後（新增 AI 產出的欄位）
interface AnalyzedNewsItem extends NewsItem {
  importanceScore: number;
  category: NewsCategory;
  aiSummary: string;
  sentiment: Sentiment;
}

// 最終：報告結構
interface DailyReport {
  topStories: AnalyzedNewsItem[];
  categorizedStories: Record<NewsCategory, AnalyzedNewsItem[]>;
  executiveSummary: string;
  // ...
}
```

### 知識點：漸進式型別增強（Progressive Type Enrichment）

```
RawNewsItem          NewsItem              AnalyzedNewsItem
┌──────────┐        ┌──────────┐          ┌──────────────┐
│ url      │        │ id (新增) │          │ id           │
│ title    │  ──→   │ url      │   ──→    │ url          │
│ content? │        │ title    │          │ title        │
│ pubAt:str│        │ content  │          │ content      │
└──────────┘        │ pubAt:Date│          │ pubAt:Date   │
                    │ tags:[]  │          │ score (新增) │
                    └──────────┘          │ category(新增)│
                                          │ aiSummary(新增)│
                                          └──────────────┘
```

每經過一個 Pipeline 步驟，型別就「增長」一些：
- `content?`（可選）→ `content`（必有）：normalizer 保證
- `publishedAt: string` → `publishedAt: Date`：normalizer 保證
- 新增 `id`：normalizer 生成
- 新增 `importanceScore`、`category`：analyzer 填入

TypeScript 的 `extends` 關鍵字讓這種漸進增強在編譯期就被檢查。如果 analyzer 忘了填 `importanceScore`，TypeScript 會直接報錯。

### 知識點：自訂錯誤類別

```typescript
export class AllSourcesFailedError extends Error {
  constructor(message = '所有新聞來源均失敗') {
    super(message);
    this.name = 'AllSourcesFailedError';
  }
}

export class ConfigValidationError extends Error {
  constructor(missingKey: string) {
    super(`缺少必要環境變數：${missingKey}`);
    this.name = 'ConfigValidationError';
  }
}
```

為什麼不直接 `throw new Error('...')`？自訂錯誤類別讓你可以用 `instanceof` 做精確的錯誤處理：

```typescript
try {
  await runDailyPipeline();
} catch (err) {
  if (err instanceof AllSourcesFailedError) {
    // 所有來源掛了 → 寄警報信
  } else if (err instanceof ConfigValidationError) {
    // 設定錯誤 → 顯示幫助訊息
  }
}
```

---

## 12. 設計模式總結與延伸閱讀

### 本專案使用的設計模式

| 模式 | 位置 | 說明 |
|------|------|------|
| **Pipeline / Chain** | `src/index.ts` | 步驟串接，每步輸出是下步輸入 |
| **Strategy** | `collector/index.ts` | 來源定義統一介面，可替換 |
| **Graceful Degradation** | `ranker.ts` | AI 失敗 → 關鍵字備援 |
| **Worker Pool** | `summarizer.ts` | 有限並行控制 |
| **Lazy Singleton** | `reporter/index.ts` | 模板快取 |
| **Fail Fast** | `config/index.ts` | 啟動時驗證設定 |
| **Optimistic Locking** | `publisher/index.ts` | GitHub SHA 機制 |

### 延伸閱讀建議

| 主題 | 推薦資源 |
|------|---------|
| ETL 設計 | Martin Kleppmann《Designing Data-Intensive Applications》第 10-11 章 |
| Prompt Engineering | Anthropic 官方文件：Prompt Design Guidelines |
| TF-IDF / NLP 基礎 | Stanford NLP 課程（CS224N）前 3 講 |
| Node.js 並行模式 | 《Node.js Design Patterns》第 4 章 |
| TypeScript 型別系統 | Matt Pocock 的 Total TypeScript 系列 |
| 結構化日誌 | 12-Factor App 第 11 條（Logs as event streams） |

### 實作練習建議

如果你想基於這個專案繼續學習，可以嘗試：

1. **加入 Redis 快取**：在 normalize 後把結果存入 Redis，AI 分析失敗時可以斷點續跑
2. **加入冪等性檢查**：在 pipeline 開頭檢查今天是否已執行過
3. **替換 AI Provider**：把 Gemini 換成 Claude 或 OpenAI，體會策略模式的好處
4. **加入 Webhook 通知**：除了 Email，加入 Slack 或 Telegram 通知管道
5. **寫完整測試**：對 `deduplicateByTitle` 寫邊界測試（空陣列、全部相同、全部不同）
