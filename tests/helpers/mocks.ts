import type { RawNewsItem, NewsItem, AnalyzedNewsItem, TimeWindow } from '../../src/types';

/**
 * 建立測試用時間窗（覆蓋過去 24 小時）
 */
export function mockTimeWindow(): TimeWindow {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 小時前
  return { from, to: now };
}

/**
 * 建立測試用原始新聞項目
 */
export function mockRawItem(overrides?: Partial<RawNewsItem>): RawNewsItem {
  const now = new Date();
  return {
    source: 'newsapi',
    rawId: 'raw-id-001',
    url: 'https://example.com/news/bitcoin-price-surge',
    title: 'Bitcoin Price Surges to New High',
    content: 'Bitcoin reached a new all-time high today as institutional demand surges.',
    summary: 'BTC hits new ATH amid strong institutional buying.',
    publishedAt: now.toISOString(),
    author: 'Test Author',
    sourceName: 'CoinDesk',
    imageUrl: 'https://example.com/image.jpg',
    tags: ['Bitcoin', 'BTC', 'Price'],
    ...overrides,
  };
}

/**
 * 建立測試用標準化新聞項目
 */
export function mockNewsItem(overrides?: Partial<NewsItem>): NewsItem {
  return {
    id: 'abcdef1234567890',
    url: 'https://example.com/news/bitcoin-price-surge',
    title: 'Bitcoin Price Surges to New High',
    content: 'Bitcoin reached a new all-time high today as institutional demand surges.',
    publishedAt: new Date(),
    sourceName: 'CoinDesk',
    sourceType: 'newsapi',
    author: 'Test Author',
    imageUrl: 'https://example.com/image.jpg',
    tags: ['bitcoin', 'btc', 'price'],
    ...overrides,
  };
}

/**
 * 建立測試用 AI 分析後新聞項目
 */
export function mockAnalyzedItem(overrides?: Partial<AnalyzedNewsItem>): AnalyzedNewsItem {
  return {
    id: 'abcdef1234567890',
    url: 'https://example.com/news/bitcoin-price-surge',
    title: 'Bitcoin Price Surges to New High',
    content: 'Bitcoin reached a new all-time high today as institutional demand surges.',
    publishedAt: new Date(),
    sourceName: 'CoinDesk',
    sourceType: 'newsapi',
    author: 'Test Author',
    imageUrl: 'https://example.com/image.jpg',
    tags: ['bitcoin', 'btc', 'price'],
    importanceScore: 8,
    category: 'market',
    aiSummary: '比特幣今日衝破歷史新高，機構資金大量流入，市場情緒樂觀。',
    relatedTickers: ['BTC'],
    sentiment: 'positive',
    ...overrides,
  };
}
