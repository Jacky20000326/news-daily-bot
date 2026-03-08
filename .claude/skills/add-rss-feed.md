---
name: add-rss-feed
description: 新增一個 RSS feed 來源到 RSS 收集器
user_invocable: true
---

# 新增 RSS Feed 來源

為 RSS 收集器新增一個新的 feed 來源。請詢問使用者要新增的 RSS feed URL 與媒體名稱。

## 修改檔案

### `src/collector/rss.ts`

在 RSS feeds 清單中新增一筆：

```typescript
{
  url: 'https://example.com/rss',
  sourceName: '媒體名稱',
}
```

## 驗證步驟

1. 先用瀏覽器或 curl 確認 RSS feed URL 可存取且格式正確（RSS 2.0 或 Atom）
2. 確認 feed 項目有 `title`、`link`、`pubDate` 等必要欄位
3. 執行測試驗證：
   ```bash
   DRY_RUN=true pnpm dev
   ```
4. 觀察日誌確認新 feed 有被成功收集

## 注意事項

- RSS parser（`rss-parser`）支援 RSS 2.0 和 Atom 格式
- `sourceName` 會出現在最終報告中，使用該媒體的正式名稱
- 單一 feed 失敗不影響其他 feed（由 `Promise.allSettled` 保護）
- 某些 feed 可能需要自訂 headers（如 User-Agent），需在 rss.ts 中設定
