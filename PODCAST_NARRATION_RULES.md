# Podcast 敘述內容優先級規則

## 概述

本文檔定義了 NotebookLM Podcast 生成時的內容優先級規則。通過優先級系統，確保 Podcast 內容以 **重點新聞深度分析** 和 **今日市場總覽** 為核心，其他新聞作為補充。

---

## 優先級結構

```
┌─────────────────────────────────────────┐
│ 開場 + 今日市場總覽 (執行摘要)           │ ← 背景脈絡
├─────────────────────────────────────────┤
│ 🔴 主要新聞（前 6 則）                  │
│    ├─ 標題                              │
│    ├─ AI 摘要（100-150字）              │
│    └─ 深度分析（400-600字）             │ ← 核心內容
├─────────────────────────────────────────┤
│ 🟡 次要新聞（第 7-10 則）               │
│    └─ 標題 / 簡要提及                   │ ← 補充信息
├─────────────────────────────────────────┤
│ 結語                                    │
└─────────────────────────────────────────┘
```

---

## 三種配置方案

### 1️⃣ DEFAULT_NARRATION_CONFIG（推薦）

**特點：平衡重點和全面性**

```typescript
{
  primaryNewsCount: 6,              // 前 6 則為主要內容
  includeDeepAnalysis: true,        // 包含深度分析
  secondaryNewsCount: 4,            // 第 7-10 則為次要內容
  secondaryDetailLevel: 'brief',    // 簡要提及（只有標題）
  includeExecutiveSummary: true,    // 包含市場總覽
  executiveSummaryPosition: 'start', // 開場作為背景
}
```

**內容結構：**
```
1. 開場 + 市場總覽（作為背景脈絡）
2. [重點分析] 
   第1則：標題 + 摘要 + 深度分析 ✓
   第2則：標題 + 摘要 + 深度分析 ✓
   ...
   第6則：標題 + 摘要 + 深度分析 ✓
3. [其他重要新聞簡覽]
   • 標題 7
   • 標題 8
   • 標題 9
   • 標題 10
4. 結語
```

**適用場景：**
- ✅ 日常日報 Podcast
- ✅ 標準版本發布
- ✅ 需要平衡深度和廣度

**播報時長：** 3-4 分鐘

---

### 2️⃣ BRIEF_CONFIG（快速版）

**特點：僅強調主要新聞**

```typescript
{
  primaryNewsCount: 6,
  includeDeepAnalysis: true,
  secondaryNewsCount: 0,            // ❌ 不包含次要新聞
  secondaryDetailLevel: 'minimal',
  includeExecutiveSummary: true,
  executiveSummaryPosition: 'start',
}
```

**內容結構：**
```
1. 開場 + 市場總覽
2. [重點分析]
   第1-6則：各含標題 + 摘要 + 深度分析 ✓
3. 結語
```

**適用場景：**
- ⚡ 時間有限時
- ⚡ 緊急更新
- ⚡ 移動端快速收聽

**播報時長：** 2-3 分鐘

---

### 3️⃣ FULL_CONFIG（完整版）

**特點：全面覆蓋，詳細分析**

```typescript
{
  primaryNewsCount: 6,
  includeDeepAnalysis: true,
  secondaryNewsCount: 4,
  secondaryDetailLevel: 'summary',  // 次要新聞也含摘要
  includeExecutiveSummary: true,
  executiveSummaryPosition: 'start',
}
```

**內容結構：**
```
1. 開場 + 市場總覽
2. [重點分析]
   第1-6則：各含標題 + 摘要 + 深度分析 ✓
3. [其他重要新聞詳解]
   第7則：標題 + 摘要
   第8則：標題 + 摘要
   第9則：標題 + 摘要
   第10則：標題 + 摘要
4. 結語
```

**適用場景：**
- 📚 深度分析版本
- 📚 專業投資者
- 📚 歸檔報告

**播報時長：** 5-6 分鐘

---

## 使用方法

### 方法 1：在 Podcast 生成時應用規則

```typescript
import { generatePodcast } from './src/podcast';
import { buildNarrationSegmentsWithRules, DEFAULT_NARRATION_CONFIG } from './src/podcast/narration-rules';

// 使用默認規則構建敘述文本
const segments = buildNarrationSegmentsWithRules(report, DEFAULT_NARRATION_CONFIG);

// 將文本作為 source 上傳至 NotebookLM
const sourceText = segments.join('\n\n');
```

### 方法 2：估算內容長度

```typescript
import { estimateNarrationLength } from './src/podcast/narration-rules';

const stats = estimateNarrationLength(report, DEFAULT_NARRATION_CONFIG);
console.log(`預計時長：${stats.estimatedDurationMinutes} 分鐘`);
console.log(`總字符數：${stats.totalCharacters}`);
```

### 方法 3：分析新聞優先級

```typescript
import { analyzeNewsPriority } from './src/podcast/narration-rules';

const priority = analyzeNewsPriority(report);
console.log('主要新聞：', priority['主要新聞標題']);
console.log('次要新聞：', priority['次要新聞標題']);
```

---

## 內容優先級詳解

### 🔴 主要新聞（前 6 則）

**組成：**
- 標題
- AI 摘要（100-150 字）
- 深度分析（400-600 字）

**特點：**
- 每則新聞獨立成段
- 包含完整背景分析
- 涵蓋市場影響評估
- 適合詳細討論

**例子：**
```
第1則。FlamingChina 黑客聲稱竊取中國超級計算中心 10+ PB 數據。

黑客據稱通過入侵 VPN 竊取超過 10PB 的軍事數據，
可能是有史以來最大的數據泄露事件。

深度分析：
**事件背景：**
此次數據泄露涉及中國最重要的超級計算設施...
**安全影響：**
引發全球對加密貨幣交易所安全的關注...
**市場反應：**
預期將推動用戶對鏈上安全的重視...
```

### 🟡 次要新聞（第 7-10 則）

**三種詳細程度：**

| 程度 | 內容 | 適用 |
|------|------|------|
| **brief** | 僅標題 | DEFAULT_CONFIG |
| **summary** | 標題 + 摘要 | FULL_CONFIG |
| **minimal** | 超短版標題 | BRIEF_CONFIG |

**例子（brief）：**
```
其他重要新聞簡覽。
• 貝萊德從 Coinbase 提取 2.64 億美元比特幣和以太坊。
• XRP 在日本獲得監管明確時間表。
• 貝萊德本週購買 5.89 億美元比特幣和以太坊。
• 比特幣和以太坊 ETF 單日淨流入 4.43 億美元。
```

### 📝 執行摘要（市場總覽）

**位置：** 開場背景

**作用：**
- 提供市場整體脈絡
- 關聯各則新聞的共同主題
- 幫助聽眾快速理解市場狀況

**長度：** 250-300 字

**例子：**
```
加密貨幣市場今日呈現複雜格局。安全方面，中國超級計算中心
據稱遭黑客入侵，涉及超過 10PB 數據。技術發展上，量子安全
比特幣方案發布。監管端持續推進，美國財政部支持 CLARITY 法案，
日本為 XRP 制定監管時間表。機構投資方面，貝萊德本週購買超
5.89 億美元的比特幣和以太坊...
```

---

## 內容統計

### DEFAULT_CONFIG 示例

| 指標 | 數值 |
|------|------|
| 總字符數 | 2,915 |
| 總詞數 | 761 |
| 預計播報時長 | 4.2 分鐘 |
| 每分鐘字數 | 694 |
| 主要新聞數 | 6 |
| 次要新聞數 | 4 |
| 分段數 | 14 |

### 時長對比

```
BRIEF_CONFIG:    2.0 - 2.5 分鐘
DEFAULT_CONFIG:  3.5 - 4.5 分鐘  ⭐ 推薦
FULL_CONFIG:     5.0 - 6.0 分鐘
```

---

## 規則配置建議

### 日常使用

**推薦：DEFAULT_NARRATION_CONFIG**

```typescript
const config = DEFAULT_NARRATION_CONFIG;
const segments = buildNarrationSegmentsWithRules(report, config);
```

**原因：**
✅ 重點突出（前 6 則含深度分析）
✅ 全面覆蓋（包含次要新聞簡覽）
✅ 時長適中（3-4 分鐘）
✅ 信息平衡（深度 vs 廣度）

### 特殊場景

**市場危機 / 緊急更新：BRIEF_CONFIG**
```typescript
const config = BRIEF_CONFIG;
// 只報導前 6 則主要新聞
// 跳過次要新聞，節省時間
```

**深度研究 / 專業報告：FULL_CONFIG**
```typescript
const config = FULL_CONFIG;
// 包含所有 10 則新聞
// 次要新聞也有詳細摘要
```

---

## 規則演進

### 版本 1.0（當前）

- ✅ 三層級優先級系統
- ✅ 可配置的詳細程度
- ✅ 市場總覽作為背景
- ✅ 深度分析集中在前 6 則

### 未來改進

- 🔜 按市場情緒動態調整優先級
- 🔜 按資產類別分類展示
- 🔜 個性化配置保存
- 🔜 A/B 測試不同規則效果

---

## 文件位置

```
src/podcast/
├── narration-rules.ts         ← 規則定義和函數
└── index.ts                   ← Podcast 生成邏輯

scripts/
└── demo-narration-rules.ts    ← 演示腳本
```

---

## 快速開始

### 1. 查看演示效果

```bash
pnpm ts-node scripts/demo-narration-rules.ts
```

### 2. 在代碼中應用

```typescript
import { buildNarrationSegmentsWithRules, DEFAULT_NARRATION_CONFIG } from './src/podcast/narration-rules';

// 構建敘述文本
const segments = buildNarrationSegmentsWithRules(report, DEFAULT_NARRATION_CONFIG);
const sourceText = segments.join('\n\n');

// 傳遞給 NotebookLM
await client.sources.addFromText(notebookId, {
  title: `日報內容 ${report.reportDate}`,
  content: sourceText,
});
```

### 3. 估算時長

```typescript
import { estimateNarrationLength } from './src/podcast/narration-rules';

const stats = estimateNarrationLength(report);
console.log(`播報時長：${stats.estimatedDurationMinutes} 分鐘`);
```

---

## 常見問題

### Q：為什麼前 6 則新聞特別強調？

A：前 6 則是重要度最高的新聞，包含深度分析能夠為聽眾提供足夠的背景信息。第 7-10 則作為補充，簡要提及即可。

### Q：執行摘要在開場是否太長？

A：執行摘要 250-300 字約 30-40 秒播報時間，足以提供市場脈絡而不會拖延。如需加快速度，可改用 BRIEF_CONFIG。

### Q：能否自訂優先級規則？

A：可以。在 `narration-rules.ts` 中定義新的 `NarrationConfig`：
```typescript
export const CUSTOM_CONFIG: NarrationConfig = {
  primaryNewsCount: 8,
  includeDeepAnalysis: false,
  secondaryNewsCount: 2,
  // ... 其他配置
};
```

### Q：次要新聞的詳細程度如何選擇？

A：
- **brief**（簡潔）：時間緊張或日常更新
- **summary**（摘要）：完整報告或深度分析
- **minimal**（極簡）：快速通知

---

## 相關文件

- [實作詳細分析報告](./IMPLEMENTATION_REPORT.md) - NotebookLM Podcast 流程說明
- [Podcast 生成指南](./src/podcast/index.ts) - 代碼實現
- [演示腳本](./scripts/demo-narration-rules.ts) - 規則系統演示

---

**最後更新：2026-04-12**
**版本：1.0**
