---
name: test-module
description: 針對指定模組撰寫或執行測試，支援單元測試與整合測試
user_invocable: true
---

# 模組測試

針對指定模組撰寫或執行測試。請詢問使用者要測試的模組名稱。

## 測試框架

- 框架：Vitest
- 測試目錄結構：
  - `tests/unit/` — 單元測試
  - `tests/integration/` — 整合測試（完整 pipeline）
  - `tests/helpers/` — 共用 mock 資料

## 執行指令

```bash
# 執行全部測試
pnpm test

# 執行單一測試檔
pnpm vitest run tests/unit/目標.test.ts

# 監聽模式（開發中持續跑）
pnpm test:watch

# 含覆蓋率
pnpm test:coverage
```

## 各模組測試重點

### normalizer（`tests/unit/normalizer.test.ts`）
- URL 驗證（無效 URL 應被過濾）
- publishedAt 解析（各種日期格式）
- 時間窗過濾（窗外項目應排除）
- ID 生成（SHA-256(url) 前 16 hex）

### deduplicator（`tests/unit/deduplicator.test.ts`）
- URL 精確去重
- 標題相似度去重（cosine similarity > 0.85）
- 邊界案例：空陣列、單筆、全重複

### ranker（`tests/unit/ranker.test.ts`）
- Mock Gemini API 回應
- JSON 解析（含 markdown 包裹）
- 驗證函式（分數範圍、分類合法性）
- 關鍵字備援分類
- 批次處理邏輯

### reporter（`tests/unit/reporter.test.ts`）
- HTML 產出包含必要區塊
- 純文字版格式正確
- 空資料處理

### mailer（`tests/unit/mailer.test.ts`）
- Mock nodemailer transport
- 收件者清單解析
- DRY_RUN 模式跳過

### pipeline 整合（`tests/integration/pipeline.test.ts`）
- Mock 所有外部 API
- 驗證完整流程產出 DailyReport 結構

## 撰寫測試注意事項

1. 外部 API 一律 mock（Gemini、NewsAPI、SMTP 等）
2. 使用 `vi.mock()` mock 模組，`vi.spyOn()` 監控呼叫
3. 測試檔案命名：`tests/unit/模組名.test.ts`
4. mock 資料放在 `tests/helpers/`，共用跨測試
5. config 模組需 mock 以避免 `ConfigValidationError`
