import { NewsItem, NewsCategory } from '../../types';

// ─── 備援單筆分類 Prompt ───────────────────────────────────────────────────────

/**
 * 建立單筆新聞分類的備援 Prompt（當批次 ranking 失敗時使用）
 *
 * 回傳格式與 buildRankingPrompt 相同的 JSON 結構，但僅針對單筆
 */
export function buildClassificationPrompt(item: NewsItem): string {
  const newsData = {
    id: item.id,
    title: item.title,
    content: item.content.slice(0, 500),
  };

  const newsJson = JSON.stringify(newsData, null, 2);

  return `你是一位專業的加密貨幣市場分析師，請對以下單則新聞進行評分與分類。

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

請只回傳包含一個元素的 JSON 陣列，不得包含任何額外說明文字、markdown 標記或程式碼區塊：

[
  {
    "id": "新聞的原始 id",
    "importanceScore": 5,
    "category": "other",
    "relatedTickers": [],
    "sentiment": "neutral"
  }
]

注意事項：
- relatedTickers 使用常見代號（BTC、ETH、BNB、SOL 等），若無相關代號則回傳空陣列 []
- importanceScore 必須為 1 到 10 之間的整數
- 僅回傳 JSON，不得有任何其他內容`;
}

// ─── 關鍵字分類對照表 ─────────────────────────────────────────────────────────

const KEYWORD_MAP: Record<NewsCategory, string[]> = {
  market: ['price', 'rally', 'dump', 'ath', 'bull', 'bear'],
  regulation: ['sec', 'regulation', 'ban', 'legal', 'government'],
  technology: ['upgrade', 'mainnet', 'fork', 'protocol', 'layer'],
  defi: ['defi', 'yield', 'liquidity', 'tvl', 'amm'],
  nft: ['nft', 'opensea', 'collectible', 'metaverse'],
  security: ['hack', 'exploit', 'stolen', 'phishing'],
  macro: ['inflation', 'fed', 'interest rate', 'gdp'],
  exchange: ['binance', 'coinbase', 'ftx', 'listing', 'delist'],
  other: [],
};

/**
 * 依關鍵字對標題進行分類的備援函式
 *
 * 遍歷關鍵字對照表，回傳第一個命中的分類；
 * 若所有關鍵字均未命中則回傳 'other'
 */
export function classifyByKeywords(item: NewsItem): NewsCategory {
  const text = `${item.title} ${item.content}`.toLowerCase();

  // 依照優先順序檢查各分類（security 優先，避免被 market 覆蓋）
  const PRIORITY_ORDER: NewsCategory[] = [
    'security',
    'regulation',
    'macro',
    'defi',
    'nft',
    'exchange',
    'technology',
    'market',
    'other',
  ];

  for (const category of PRIORITY_ORDER) {
    const keywords = KEYWORD_MAP[category];
    if (keywords.length === 0) continue;

    const matched = keywords.some((kw) => text.includes(kw));
    if (matched) {
      return category;
    }
  }

  return 'other';
}
