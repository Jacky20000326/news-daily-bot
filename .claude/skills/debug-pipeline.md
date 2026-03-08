---
name: debug-pipeline
description: 除錯每日報告 pipeline 的執行問題，系統性排查各階段錯誤
user_invocable: true
---

# Pipeline 除錯

系統性排查每日報告 pipeline 的執行問題。請詢問使用者遇到的錯誤訊息或異常行為。

## 排查流程

### 1. 環境檢查

- 確認 `.env` 存在且包含所有 `REQUIRED_VARS`（見 `src/config/index.ts`）
- 確認 Node.js 版本 >= 20
- 執行 `pnpm install` 確保依賴完整

### 2. 依 pipeline 階段逐步排查

#### ConfigValidationError
- 缺少必要環境變數，檢查 `.env` 中的 GEMINI_API_KEY、NEWSAPI_KEY、SENDER_EMAIL、EMAIL_RECIPIENTS、SMTP_USER、SMTP_PASS

#### AllSourcesFailedError（收集階段）
- 所有新聞來源都失敗了
- 逐一檢查：NewsAPI key 是否有效、CryptoPanic token、RSS feeds 是否可達
- 可用 `LOG_LEVEL=debug` 查看詳細 HTTP 錯誤
- 檢查 `src/collector/` 下各來源的 API 回應格式是否有變更

#### 標準化階段（normalizer）
- 若 normalizedCount 為 0：檢查時間窗設定（`src/utils/time.ts`），來源的 publishedAt 是否在窗口內
- URL 驗證失敗：檢查來源回傳的 URL 格式

#### 去重階段（deduplicator）
- 若去重後數量過少：檢查 TF-IDF cosine similarity 閾值（預設 0.85）
- 檢查 `src/deduplicator/index.ts` 中的去重邏輯

#### AI 分析階段（analyzer）
- Gemini API 錯誤：檢查 GEMINI_API_KEY 有效性、配額限制
- JSON 解析失敗：AI 回傳格式異常，檢查 `src/analyzer/ranker.ts` 的 `parseRankingResponse`
- 安全篩選器阻擋：Gemini 拒絕處理特定內容，為 NonRetryableError，無法重試
- 全部使用關鍵字備援：AI 呼叫連續失敗，檢查 API 狀態

#### 報告生成階段（reporter）
- Handlebars 模板錯誤：檢查 `src/reporter/templates/daily-report.hbs` 語法
- Helper 未註冊：確認 `src/reporter/index.ts` 中有註冊所需的 Handlebars helper

#### Email 發送階段（mailer）
- SMTP 認證失敗：檢查 SMTP_USER/SMTP_PASS（Gmail 需使用應用程式密碼）
- 連線逾時：檢查 SMTP_HOST 和 SMTP_PORT 設定

#### 發布階段（publisher）
- GitHub Token 無效或權限不足：檢查 GITHUB_TOKEN 的 repo scope
- 確認 GITHUB_OWNER 和 GITHUB_REPO 設定正確

### 3. 快速除錯指令

```bash
# 開啟 debug 日誌層級
LOG_LEVEL=debug DRY_RUN=true pnpm dev

# 只跑測試確認邏輯正確
pnpm test

# 檢查 TypeScript 編譯
pnpm build
```
