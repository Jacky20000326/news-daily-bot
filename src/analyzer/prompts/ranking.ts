import { NewsItem } from '../../types';

// ─── Ranking Prompt ───────────────────────────────────────────────────────────

/**
 * 建立批次新聞評分與分類的 Prompt
 *
 * 要求 AI 對每則新聞：
 * 1. 評定重要度分數（1-10）
 * 2. 分類至指定類別
 * 3. 識別相關加密貨幣代號
 * 4. 判斷情緒傾向
 */
export function buildRankingPrompt(items: NewsItem[]): string {
  // 準備輸入資料：每筆只傳 id、title、content 前 500 字
  const newsData = items.map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content.slice(0, 500),
  }));

  const newsJson = JSON.stringify(newsData, null, 2);

  return `你是一位專業的加密貨幣市場分析師，請對以下新聞進行評分與分類。

## 評分標準

| 分數 | 說明 |
|------|------|
| 9-10 | 對整體市場或產業有重大影響（監管重大決策、重大駭客攻擊、主要交易所上下架等） |
| 7-8  | 對特定幣種或領域有顯著影響 |
| 5-6  | 一般性新聞，有參考價值 |
| 3-4  | 資訊性內容，影響有限 |
| 1-2  | 廣告性質或低價值內容 |

## 新聞分類（category）

- market：市場行情（價格、漲跌、市值）
- regulation：監管政策（法規、政府決策、合規）
- technology：技術發展（協議升級、主網上線、分叉）
- defi：去中心化金融（流動性、TVL、AMM、收益）
- nft：NFT 相關（OpenSea、數位收藏品、元宇宙）
- security：安全事件（駭客攻擊、漏洞利用、詐騙、釣魚）
- macro：總體經濟（通膨、聯準會、利率、GDP）
- exchange：交易所動態（上下架、費率、交易所新聞）
- other：不符合以上分類的其他內容

## 情緒判斷（sentiment）

- positive：正面（利多消息、價格上漲、技術突破）
- negative：負面（利空消息、駭客攻擊、監管打壓）
- neutral：中性（資訊性報導、無明確市場影響）

## 待分析新聞

\`\`\`json
${newsJson}
\`\`\`

## 輸出要求

請只回傳 JSON 陣列，不得包含任何額外說明文字、markdown 標記或程式碼區塊。格式如下：

[
  {
    "id": "新聞的原始 id",
    "importanceScore": 8,
    "category": "regulation",
    "relatedTickers": ["BTC", "ETH"],
    "sentiment": "negative"
  }
]

注意事項：
- 陣列長度必須與輸入新聞數量相同
- relatedTickers 使用常見代號（BTC、ETH、BNB、SOL 等），若無相關代號則回傳空陣列 []
- importanceScore 必須為 1 到 10 之間的整數
- 僅回傳 JSON，不得有任何其他內容`;
}
