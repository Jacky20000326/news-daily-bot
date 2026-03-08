---
name: dry-run
description: 以 DRY_RUN 模式執行完整 pipeline，跳過 Email 發送，用於本地測試與驗證
user_invocable: true
---

# 本地測試執行（Dry Run）

以 `DRY_RUN=true` 模式執行完整的每日報告 pipeline，跳過實際 Email 發送。

## 執行步驟

1. 先確認 `.env` 檔案存在且包含必要環境變數（GEMINI_API_KEY、NEWSAPI_KEY 等）
2. 執行指令：
   ```bash
   DRY_RUN=true pnpm dev
   ```
3. 觀察 console 輸出，確認每個步驟是否正常完成：
   - 收集（collector）：檢查各來源收集到的新聞數量
   - 標準化（normalizer）：確認標準化後數量
   - 去重（deduplicator）：確認去重結果
   - AI 分析（analyzer）：確認評分與摘要
   - 報告生成（reporter）：確認 HTML 產出
   - Email 發送：應顯示 "dryRun 模式：跳過 Email 發送"
4. 若執行失敗，分析錯誤日誌並提供修復建議

## 注意事項

- 此模式會實際呼叫外部 API（NewsAPI、CryptoPanic、RSS、Gemini），會消耗 API 配額
- 若只想測試特定模組，應使用 `pnpm test` 搭配單元測試
- 檢查輸出時重點關注：來源收集成功/失敗數、去重移除數、AI 評分分佈
