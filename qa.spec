# QA 測試報告 — crypto-daily-news
# 生成日期：2026-03-07
# 測試框架：Vitest v1.6.1
# 測試結果：149 passed / 0 failed / 12 test files
# 覆蓋率：91.75% Statements / 80.39% Branches / 88.6% Functions / 91.75% Lines

## ═══════════════════════════════════════════════════════
##  測試總覽
## ═══════════════════════════════════════════════════════

| 測試檔案                                       | 測試數 | 狀態 |
|-----------------------------------------------|--------|------|
| tests/unit/normalizer.test.ts                 |     19 | PASS |
| tests/unit/deduplicator.test.ts               |     12 | PASS |
| tests/unit/ranker.test.ts                     |     19 | PASS |
| tests/unit/reporter.test.ts                   |     16 | PASS |
| tests/unit/mailer.test.ts                     |     14 | PASS |
| tests/unit/publisher.test.ts                  |     13 | PASS |
| tests/unit/scheduler.test.ts                  |      8 | PASS |
| tests/unit/collector-newsapi.test.ts          |     10 | PASS |
| tests/unit/collector-cryptopanic.test.ts      |      8 | PASS |
| tests/unit/collector-rss.test.ts              |      8 | PASS |
| tests/integration/pipeline.test.ts            |     12 | PASS |
| tests/e2e/full-pipeline.test.ts               |     10 | PASS |
| **合計**                                       | **149**| **ALL PASS** |

執行時間：7.36s

## ═══════════════════════════════════════════════════════
##  測試覆蓋率報告（v8）
## ═══════════════════════════════════════════════════════

| 模組                     | Stmts   | Branch  | Funcs   | Lines   |
|-------------------------|---------|---------|---------|---------|
| **整體**                 | **91.75%** | **80.39%** | **88.6%** | **91.75%** |
| src/index.ts            | 92.56%  | 87.50%  | 50.00%  | 92.56%  |
| src/analyzer/index.ts   | 94.62%  | 80.00%  | 100%    | 94.62%  |
| src/analyzer/ranker.ts  | 73.09%  | 50.00%  | 62.50%  | 73.09%  |
| src/analyzer/summarizer.ts | 86.33% | 70.00% | 100%   | 86.33%  |
| src/analyzer/prompts/classification.ts | 48.36% | 100% | 50.00% | 48.36% |
| src/analyzer/prompts/ranking.ts | 100% | 100%  | 100%    | 100%    |
| src/analyzer/prompts/summary.ts | 100% | 75.00% | 100%  | 100%    |
| src/collector/index.ts  | 86.44%  | 66.66%  | 100%    | 86.44%  |
| src/collector/newsapi.ts | 98.52% | 73.07%  | 100%    | 98.52%  |
| src/collector/cryptopanic.ts | 96.12% | 73.91% | 100%  | 96.12%  |
| src/collector/rss.ts    | 97.59%  | 65.85%  | 100%    | 97.59%  |
| src/deduplicator/index.ts | 96.72% | 83.33% | 100%   | 96.72%  |
| src/mailer/index.ts     | 98.06%  | 88.88%  | 100%    | 98.06%  |
| src/normalizer/index.ts | 100%    | 95.00%  | 100%    | 100%    |
| src/publisher/index.ts  | 96.31%  | 84.00%  | 100%    | 96.31%  |
| src/reporter/index.ts   | 100%    | 91.66%  | 100%    | 100%    |
| src/scheduler/index.ts  | 100%    | 100%    | 100%    | 100%    |
| src/utils/logger.ts     | 100%    | 94.44%  | 100%    | 100%    |
| src/utils/retry.ts      | 84.14%  | 61.53%  | 50.00%  | 84.14%  |
| src/utils/time.ts       | 96.66%  | 100%    | 75.00%  | 96.66%  |

## ═══════════════════════════════════════════════════════
##  QA 團隊（第一輪）— 已全數完成
## ═══════════════════════════════════════════════════════

### QA-1: Reporter 單元測試工程師 — 16 個測試
### QA-2: Mailer 單元測試工程師 — 14 個測試
### QA-3: Publisher 單元測試工程師 — 13 個測試
### QA-4: 整合測試修復工程師 — 修復 4 個既有測試檔案

## ═══════════════════════════════════════════════════════
##  工程團隊（第二輪）— 已全數完成
## ═══════════════════════════════════════════════════════

### ENG-1: Scheduler 測試工程師
- 產出：tests/unit/scheduler.test.ts（8 個測試）
- 狀態：PASS
- 測試策略：使用 vi.hoisted() + vi.resetModules() 處理 side-effect 模組

### ENG-2: Collector 來源測試工程師
- 產出：3 個測試檔案（共 26 個測試）
  - collector-newsapi.test.ts（10 個測試）
  - collector-cryptopanic.test.ts（8 個測試）
  - collector-rss.test.ts（8 個測試）
- 狀態：ALL PASS
- 測試策略：mock httpClient / rss-parser，驗證轉換邏輯、過濾邏輯、分頁邏輯

### ENG-3: E2E Pipeline 測試工程師
- 產出：tests/e2e/full-pipeline.test.ts（10 個測試）
- 狀態：PASS
- 測試策略：mock 所有外部依賴（AI、SMTP、HTTP、RSS），讓內部邏輯真實執行

## ═══════════════════════════════════════════════════════
##  第一輪修復的既有問題（6 項，全數完成）
## ═══════════════════════════════════════════════════════

- [x] 環境變數過時：ANTHROPIC_API_KEY → GEMINI_API_KEY, SENDGRID_API_KEY → SMTP_USER/SMTP_PASS
- [x] AI SDK Mock 過時：@anthropic-ai/sdk → @google/generative-ai
- [x] Config Mock 過時：新增 smtp/publisher 區塊
- [x] topStories 斷言錯誤：<= 5 → <= 6
- [x] Mailer 函式簽名變更：sendReport(report, html) → sendReport(report)
- [x] Publisher Mock 缺失：新增 publisher mock

## ═══════════════════════════════════════════════════════
##  第二輪補強項目（4 項，全數完成）
## ═══════════════════════════════════════════════════════

- [x] scheduler 模組的 cron 排程測試 → tests/unit/scheduler.test.ts（8 測試）
- [x] 各 collector 來源個別單元測試 → 3 個檔案（26 測試）
- [x] E2E 測試 → tests/e2e/full-pipeline.test.ts（10 測試）
- [x] 測試覆蓋率報告 → 91.75% Stmts / 80.39% Branch

## ═══════════════════════════════════════════════════════
##  完整測試清單
## ═══════════════════════════════════════════════════════

### tests/unit/normalizer.test.ts（19 個測試）
- [PASS] 正常項目能正確標準化：id 為 16 字元
- [PASS] 正常項目能正確標準化：publishedAt 為 Date 物件
- [PASS] 正常項目能正確標準化：tags 轉換為小寫
- [PASS] publishedAt 無法解析時跳過該筆（不拋出錯誤）
- [PASS] publishedAt 為空字串時跳過該筆
- [PASS] title 為空時過濾掉
- [PASS] title 為僅空白時過濾掉
- [PASS] url 為空時過濾掉
- [PASS] url 為無效格式時過濾掉
- [PASS] url 非 http/https 時過濾掉
- [PASS] 不在時間窗內的項目被過濾掉（早於 from）
- [PASS] 不在時間窗內的項目被過濾掉（晚於 to）
- [PASS] content 合併邏輯：有 content 時使用 content
- [PASS] content 合併邏輯：無 content 時使用 title + summary
- [PASS] content 合併邏輯：無 content 也無 summary 時只使用 title
- [PASS] content 為空字串時使用 title + summary
- [PASS] 混合有效與無效項目時，只回傳有效項目
- [PASS] tags 為 undefined 時回傳空陣列
- [PASS] sourceType 對應來源的 source 欄位

### tests/unit/deduplicator.test.ts（12 個測試）
- [PASS] 能移除相同 URL 的重複項目
- [PASS] URL 正規化：移除 utm_source 參數後視為同一筆
- [PASS] URL 正規化：trailing slash 處理
- [PASS] URL 正規化：同時有 UTM 參數和 trailing slash
- [PASS] 標題相似度 > 0.85 視為重複（跨批次）
- [PASS] 完全不同的標題不被去重
- [PASS] 回傳物件包含 removedByUrl
- [PASS] 回傳物件包含 removedByTitle
- [PASS] 空陣列輸入時正確處理
- [PASS] 單一項目輸入時不被去重
- [PASS] 多個不同 URL 的項目都被保留
- [PASS] URL 去重後的數量等於原始數量減去 removedByUrl

### tests/unit/ranker.test.ts（19 個測試）
- [PASS] buildRankingPrompt — 回傳字串包含 items 的 id
- [PASS] buildRankingPrompt — 回傳字串包含 items 的 title
- [PASS] buildRankingPrompt — 回傳字串包含 1-10 評分說明
- [PASS] buildRankingPrompt — prompt 說明 importanceScore
- [PASS] buildRankingPrompt — 空陣列時仍回傳字串
- [PASS] buildRankingPrompt — prompt 包含 JSON 格式輸出範例
- [PASS] classifyByKeywords — hack → security
- [PASS] classifyByKeywords — exploit → security
- [PASS] classifyByKeywords — phishing → security
- [PASS] classifyByKeywords — sec → regulation
- [PASS] classifyByKeywords — regulation → regulation
- [PASS] classifyByKeywords — ban → regulation
- [PASS] classifyByKeywords — 無關鍵字 → other
- [PASS] classifyByKeywords — security 優先於 market（hack + price）
- [PASS] classifyByKeywords — security 優先（stolen + rally）
- [PASS] classifyByKeywords — defi → defi
- [PASS] classifyByKeywords — nft → nft
- [PASS] classifyByKeywords — price → market
- [PASS] classifyByKeywords — 大小寫不影響分類

### tests/unit/reporter.test.ts（16 個測試）
- [PASS] generateReport — HTML 以 <!DOCTYPE html> 開頭
- [PASS] generateReport — HTML 包含報告日期
- [PASS] generateReport — HTML 包含 executiveSummary
- [PASS] generateReport — HTML 包含 topStories 標題
- [PASS] generateReport — HTML 包含分類新聞（market）
- [PASS] generateReport — HTML 包含 story-{id} 錨點
- [PASS] generateReport — 有 mdReportUrl 時包含連結
- [PASS] generateReport — 無 mdReportUrl 時不包含按鈕
- [PASS] generateReport — HTML 包含數據摘要
- [PASS] generateReport — topStories 為空時不拋出錯誤
- [PASS] buildPlainText — 包含報告日期
- [PASS] buildPlainText — 包含 executiveSummary
- [PASS] buildPlainText — 包含 topStories 標題
- [PASS] buildPlainText — 包含來源資訊
- [PASS] buildPlainText — 包含免責聲明
- [PASS] buildPlainText — topStories 為空時不拋出錯誤

### tests/unit/mailer.test.ts（14 個測試）
- [PASS] sendReport — 觸發 sendMail
- [PASS] sendReport — from 包含「加密日報」
- [PASS] sendReport — to 對應 config recipients
- [PASS] sendReport — subject 包含 reportDate
- [PASS] sendReport — subject 包含第一筆標題
- [PASS] sendReport — html 包含所有 topStories 標題
- [PASS] sendReport — 有 mdReportUrl 時包含「閱讀完整報告」
- [PASS] sendReport — 無 mdReportUrl 時不渲染按鈕
- [PASS] sendReport — text 為純文字版
- [PASS] sendReport — topStories 為空時 subject 使用「今日市場摘要」
- [PASS] sendAlertEmail — alertEmail 未設定時不寄送
- [PASS] sendAlertEmail — alertEmail 有設定時正確寄送
- [PASS] sendAlertEmail — Error 物件傳入時包含 message
- [PASS] sendAlertEmail — 字串傳入時也能處理

### tests/unit/publisher.test.ts（13 個測試）
- [PASS] getReportPageUrl — 完整設定回傳正確 URL
- [PASS] getReportPageUrl — URL 包含 dateStr 和 .html
- [PASS] getReportPageUrl — githubToken 為空回傳 null
- [PASS] getReportPageUrl — githubOwner 為空回傳 null
- [PASS] getReportPageUrl — githubRepo 為空回傳 null
- [PASS] publishToGitHubPages — 成功時回傳 URL
- [PASS] publishToGitHubPages — URL 與 getReportPageUrl 一致
- [PASS] publishToGitHubPages — 推送 HTML 檔案
- [PASS] publishToGitHubPages — 推送 index.html
- [PASS] publishToGitHubPages — Token 為空時回傳 null
- [PASS] publishToGitHubPages — API 失敗時回傳 null
- [PASS] publishToGitHubPages — Pages 已啟用時正常推送
- [PASS] publishToGitHubPages — Pages 未啟用時嘗試啟用

### tests/unit/scheduler.test.ts（8 個測試）
- [PASS] cron.schedule 被呼叫一次
- [PASS] cron 表達式為 "0 9 * * *"
- [PASS] options 包含 timezone: "Asia/Taipei"
- [PASS] 排程觸發時呼叫 runDailyPipeline
- [PASS] 排程觸發時記錄啟動資訊
- [PASS] runDailyPipeline 拋錯時記錄 error
- [PASS] 錯誤不會傳播到外層
- [PASS] 模組載入後記錄「排程器已啟動」

### tests/unit/collector-newsapi.test.ts（10 個測試）
- [PASS] API 回傳 1 篇文章時正確轉為 RawNewsItem
- [PASS] source 為 'newsapi'
- [PASS] rawId 為 article.url
- [PASS] sourceName 為 article.source.name
- [PASS] 跳過 title 為 null 的文章
- [PASS] 跳過 url 為 null 的文章
- [PASS] 跳過 publishedAt 為 null 的文章
- [PASS] status 不是 'ok' 時回傳空陣列
- [PASS] articles 為空陣列時回傳空陣列
- [PASS] 時間窗外的文章被過濾

### tests/unit/collector-cryptopanic.test.ts（8 個測試）
- [PASS] token 未設定時回傳空陣列
- [PASS] 正確轉為 RawNewsItem
- [PASS] source 為 'cryptopanic'
- [PASS] rawId 為 String(post.id)
- [PASS] currencies 轉為小寫 tags
- [PASS] 跳過 url 為空的 post
- [PASS] 跳過 published_at 為空的 post
- [PASS] 超出時間窗下界時停止分頁

### tests/unit/collector-rss.test.ts（8 個測試）
- [PASS] 正確轉為 RawNewsItem
- [PASS] source 為 'rss'
- [PASS] rawId 為 item.link
- [PASS] 跳過沒有 link 的 item
- [PASS] 跳過沒有 title 的 item
- [PASS] 跳過無法解析發布時間的 item
- [PASS] 時間窗外的 item 被過濾
- [PASS] 單一 feed 失敗時其他 feed 仍正常

### tests/integration/pipeline.test.ts（12 個測試）
- [PASS] 回傳 DailyReport 物件
- [PASS] 包含必要欄位
- [PASS] topStories.length <= 6
- [PASS] afterDedup <= totalCollected
- [PASS] reportDate 格式 YYYY-MM-DD
- [PASS] generatedAt 為 Date 物件
- [PASS] totalCollected 等於 collect 回傳數量
- [PASS] categorizedStories 包含 9 個分類
- [PASS] DRY_RUN 模式不呼叫 sendReport
- [PASS] topStories 有 importanceScore 1-10
- [PASS] sources 為字串陣列
- [PASS] sendReport 只傳入 report（不傳 html）

### tests/e2e/full-pipeline.test.ts（10 個測試）
- [PASS] runDailyPipeline 不拋出錯誤
- [PASS] DailyReport 包含所有必要欄位
- [PASS] topStories.length <= 6
- [PASS] 每筆 importanceScore 在 1-10
- [PASS] 每筆 category 為合法分類
- [PASS] 每筆 sentiment 為合法值
- [PASS] categorizedStories 包含 9 個分類 key
- [PASS] executiveSummary 為字串
- [PASS] sendMail 被呼叫一次
- [PASS] sendMail 的 html 包含 topStories 標題

## ═══════════════════════════════════════════════════════
##  測試覆蓋模組對照表
## ═══════════════════════════════════════════════════════

| 模組                         | 測試類型      | 覆蓋狀態 | Stmts  |
|-----------------------------|--------------|---------|--------|
| src/normalizer/             | 單元          | 完整    | 100%   |
| src/deduplicator/           | 單元          | 完整    | 96.72% |
| src/analyzer/prompts/       | 單元          | 完整    | 77.58% |
| src/analyzer/index.ts       | 整合+E2E      | 完整    | 94.62% |
| src/analyzer/ranker.ts      | 整合+E2E      | 部分    | 73.09% |
| src/analyzer/summarizer.ts  | 整合+E2E      | 部分    | 86.33% |
| src/reporter/               | 單元+E2E      | 完整    | 100%   |
| src/mailer/                 | 單元+E2E      | 完整    | 98.06% |
| src/publisher/              | 單元          | 完整    | 96.31% |
| src/scheduler/              | 單元          | 完整    | 100%   |
| src/collector/newsapi.ts    | 單元+E2E      | 完整    | 98.52% |
| src/collector/cryptopanic.ts| 單元          | 完整    | 96.12% |
| src/collector/rss.ts        | 單元+E2E      | 完整    | 97.59% |
| src/collector/index.ts      | 整合+E2E      | 部分    | 86.44% |
| src/config/                 | —            | 間接    | —      |
| src/utils/retry.ts          | —            | 間接    | 84.14% |
| src/utils/time.ts           | —            | 間接    | 96.66% |
| src/utils/logger.ts         | —            | 間接    | 100%   |

## ═══════════════════════════════════════════════════════
##  上線品質評估
## ═══════════════════════════════════════════════════════

### 通過項目
- [x] TypeScript 編譯通過（tsc --noEmit）
- [x] 149 個測試全部通過（12 個測試檔案）
- [x] 整體語句覆蓋率 91.75%
- [x] 核心模組覆蓋率 95%+（normalizer、reporter、mailer、publisher、scheduler）
- [x] E2E 完整 pipeline 驗證通過
- [x] 所有 collector 來源個別測試通過
- [x] scheduler cron 排程驗證通過
- [x] 邊界條件（空輸入、API 失敗、token 缺失）處理驗證
- [x] 環境變數與 config 一致性驗證
- [x] 新版 mailer 通知信格式驗證
- [x] GitHub Pages 發佈流程驗證

### 結論
所有 QA 提出的補強項目已全數完成。
專案整體測試覆蓋率達 91.75%，核心模組皆在 95% 以上。
149 個測試全數通過，建議可安心上線。
