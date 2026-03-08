---
name: add-source
description: 新增一個新聞來源（collector），包含收集器實作、型別註冊、整合至 pipeline
user_invocable: true
---

# 新增新聞來源

為系統新增一個新的新聞資料來源。請詢問使用者要新增的來源名稱與 API 資訊。

## 必須修改的檔案（按順序）

### 1. 註冊 SourceType（`src/types/index.ts`）

在 `SourceType` union type 中加入新來源的識別名稱：

```typescript
export type SourceType = 'newsapi' | 'cryptopanic' | 'rss' | 'coingecko' | '新來源名稱';
```

### 2. 建立收集器（`src/collector/新來源.ts`）

新檔案必須匯出一個符合以下簽名的函式：

```typescript
export async function fetch新來源(timeWindow: TimeWindow): Promise<RawNewsItem[]>
```

實作要點：
- 使用 `src/utils/retry.ts` 的 `httpClient`（已內建 axios-retry）發送 HTTP 請求
- 回傳 `RawNewsItem[]`，確保 `source` 欄位設為新來源名稱
- `publishedAt` 必須是 ISO 8601 字串
- `rawId` 使用來源 API 提供的原始 ID
- `sourceName` 填入可讀的媒體名稱

### 3. 整合至收集協調器（`src/collector/index.ts`）

在 `sources` 陣列中加入新來源定義：

```typescript
{
  name: '新來源名稱',
  enabled: Boolean(config.sources.新來源設定),
  fetch: fetch新來源,
},
```

### 4. 新增環境變數（`src/config/index.ts`）

- 若需要 API Key，加入 `REQUIRED_VARS` 或 `config.sources` 的選填設定
- 若為選填來源，加入 `ENABLE_新來源` 開關

### 5. 更新文件

- 更新 `CLAUDE.md` 的環境變數表格
- 更新 `.env.example`

### 6. 撰寫測試

在 `tests/unit/` 下建立對應的單元測試，mock HTTP 回應驗證轉換邏輯。

## 注意事項

- 新來源失敗不應中斷其他來源（`Promise.allSettled` 已處理）
- 確保 `sourceName` 有意義，它會出現在最終報告中
- 回傳的 `url` 必須是有效的絕對 URL
