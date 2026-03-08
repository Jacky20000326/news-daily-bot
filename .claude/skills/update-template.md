---
name: update-template
description: 修改每日報告的 HTML Email 模板或純文字版模板
user_invocable: true
---

# 修改報告模板

修改每日報告的 HTML Email 模板。請詢問使用者想要修改的內容。

## 關鍵檔案

| 檔案 | 用途 |
|------|------|
| `src/reporter/templates/daily-report.hbs` | HTML Email 主模板（Handlebars） |
| `src/reporter/index.ts` | 模板資料準備、Handlebars helper 註冊、純文字版 |

## 模板接收的資料結構

模板接收以下變數（由 `generateReport` 組裝）：

```typescript
{
  reportDate: string,                    // "2026-03-07"
  timeWindowFrom: string,               // "2026-03-06 09:00"
  timeWindowTo: string,                 // "2026-03-07 09:00"
  executiveSummary: string,             // AI 生成的市場總覽
  totalCollected: number,               // 收集總數
  afterDedup: number,                   // 去重後數量
  sourcesCount: number,                 // 來源數
  topStories: FormattedNewsItem[],      // 前 6 筆重點（含 aiSummary）
  categorizedStories: Record<...>,      // 依分類分組
  allStoriesByImportance: OverviewNewsItem[], // 全部依重要度排序
  mdReportUrl: string,                  // GitHub Pages 連結
}
```

### FormattedNewsItem 欄位
- `id`, `title`, `url`, `sourceName`, `imageUrl`
- `importanceScore` (1-10), `category`, `sentiment`
- `aiSummary` (繁體中文 100-150 字)
- `relatedTickers` (["BTC", "ETH"])
- `publishedAtFormatted` (台北時間字串)

### OverviewNewsItem 額外欄位
- `detailLink`: 有 AI 摘要指向 `#story-{id}`，否則指向原始 URL

## 可用的 Handlebars Helper

- `{{#if (eq a b)}}` — 相等比較
- `{{#if (gte score 8)}}` — 大於等於
- `{{#if (lte score 3)}}` — 小於等於
- `{{#if (lt score 5)}}` — 小於
- `{{#if (and condA condB)}}` — 邏輯 AND

如需新增 helper，在 `src/reporter/index.ts` 中用 `Handlebars.registerHelper()` 註冊。

## 修改注意事項

1. **Email 相容性**：HTML Email 不支援外部 CSS、JS，所有樣式必須 inline
2. **錨點連結**：topStories 每張卡片帶 `id="story-{id}"`，優先閱讀清單的 `detailLink` 會指向這些錨點
3. **純文字版**：同步更新 `buildPlainText()` 函式（`src/reporter/index.ts`）
4. **測試**：修改後用 `DRY_RUN=true pnpm dev` 驗證輸出
