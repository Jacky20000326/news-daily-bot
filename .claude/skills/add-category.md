---
name: add-category
description: 新增一個新聞分類（NewsCategory），包含型別、AI prompt、報告模板、關鍵字備援等所有關聯處
user_invocable: true
---

# 新增新聞分類

為系統新增一個新的新聞分類。請詢問使用者要新增的分類英文 ID 與中文名稱。

## 必須修改的檔案（全部都要改，缺一不可）

### 1. 型別定義（`src/types/index.ts`）

在 `NewsCategory` union type 加入新分類：

```typescript
export type NewsCategory = ... | '新分類';
```

### 2. ALL_CATEGORIES 陣列（`src/index.ts`）

在 `ALL_CATEGORIES` 常數陣列中加入新分類，確保 `categorizedStories` 會包含該 key。

### 3. AI 評分 prompt（`src/analyzer/prompts/ranking.ts`）

更新 ranking prompt，在 category 欄位說明中加入新分類及其描述。

### 4. 關鍵字備援分類（`src/analyzer/prompts/classification.ts`）

在 `classifyByKeywords` 函式中加入新分類對應的關鍵字規則。

### 5. AI 驗證（`src/analyzer/ranker.ts`）

在 `VALID_CATEGORIES` Set 中加入新分類字串。

### 6. 報告分類標籤（`src/reporter/index.ts`）

在 `CATEGORY_LABELS` 物件加入新分類的中文對照：

```typescript
新分類: '中文名稱',
```

### 7. 報告模板（`src/reporter/templates/daily-report.hbs`）

確認模板的分類迭代邏輯能自動涵蓋新分類（通常已自動處理，但需確認是否有 hardcode 的分類判斷）。

### 8. 測試更新

更新相關測試中的分類列表與 mock 資料。

## 驗證清單

- [ ] TypeScript 編譯通過（`pnpm build`）
- [ ] 所有測試通過（`pnpm test`）
- [ ] AI prompt 中有新分類的描述
- [ ] 關鍵字備援能正確分到新分類
- [ ] 報告 HTML 中能顯示新分類的中文名稱
