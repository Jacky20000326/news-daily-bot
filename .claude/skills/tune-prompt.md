---
name: tune-prompt
description: 調整 AI prompt（排名評分、分類、摘要生成），優化新聞分析品質
user_invocable: true
---

# 調整 AI Prompt

調整 Gemini AI 的 prompt 以優化新聞分析品質。請詢問使用者想改善的面向（評分準確度、分類精確度、摘要品質等）。

## Prompt 檔案位置

| 檔案 | 用途 | 呼叫方 |
|------|------|--------|
| `src/analyzer/prompts/ranking.ts` | 批次評分 + 分類 + 情緒分析 prompt | `ranker.ts` |
| `src/analyzer/prompts/summary.ts` | 單篇摘要生成 prompt | `summarizer.ts` |
| `src/analyzer/prompts/classification.ts` | 關鍵字備援分類（非 AI） | `ranker.ts` fallback |

## AI 呼叫架構

### 評分流程（`ranker.ts`）
- 批次大小：20 筆/次
- 批次間隔：1 秒
- 重試：2 次，間隔 2 秒
- 預期回傳：JSON 陣列，每筆含 `id`, `importanceScore`(1-10), `category`, `relatedTickers`, `sentiment`
- 失敗備援：`classifyByKeywords()` 關鍵字分類，分數固定 5

### 摘要流程（`summarizer.ts`）
- 只對前 6 筆（`TOP_ITEMS_FOR_SUMMARY`）生成摘要
- 摘要語言：繁體中文
- 摘要長度：100-150 字
- 另有 `generateExecutiveSummary` 生成整體市場總覽（300 字內）

## 調整原則

1. **評分標準**：修改 `ranking.ts` 中的評分指引，明確定義 1-10 分各代表的重要度
2. **分類精確度**：在 prompt 中加入各分類的明確定義與邊界案例
3. **摘要品質**：調整摘要 prompt 的語調、格式、資訊密度要求
4. **JSON 格式**：確保 prompt 中明確指定回傳 JSON 格式，ranker 依賴 `parseRankingResponse` 解析
5. **Token 限制**：注意 `config.ai.maxTokens`（預設 4096），prompt + 回應不能超過限制

## 驗證方式

```bash
# 執行 dry run 觀察 AI 分析結果
LOG_LEVEL=debug DRY_RUN=true pnpm dev

# 執行 ranker 單元測試
pnpm vitest run tests/unit/ranker.test.ts
```

修改 prompt 後務必確認：
- JSON 解析不會失敗（格式正確）
- 評分分佈合理（不全是 5 分或 10 分）
- 分類覆蓋正確（不全歸到 other）
- 摘要為繁體中文且在字數範圍內
