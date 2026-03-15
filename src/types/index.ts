// ─── 來源類型 ─────────────────────────────────────────────────────────
export type SourceType = 'newsapi' | 'rss' | 'coingecko' | 'coindesk';

// ─── 新聞分類 ─────────────────────────────────────────────────────────
export type NewsCategory =
  | 'market'      // 市場行情
  | 'regulation'  // 監管政策
  | 'technology'  // 技術發展
  | 'defi'        // DeFi
  | 'nft'         // NFT
  | 'security'    // 安全事件（駭客、詐騙）
  | 'macro'       // 總體經濟
  | 'exchange'    // 交易所動態
  | 'other';      // 其他

// ─── 情緒傾向 ─────────────────────────────────────────────────────────
export type Sentiment = 'positive' | 'negative' | 'neutral';

// ─── 時間窗定義 ───────────────────────────────────────────────────────
export interface TimeWindow {
  from: Date;  // UTC
  to: Date;    // UTC
}

// ─── 原始收集項目 ─────────────────────────────────────────────────────
export interface RawNewsItem {
  source: SourceType;
  rawId: string;         // 來源系統的原始 ID
  url: string;
  title: string;
  content?: string;      // 部分來源無全文
  summary?: string;      // 來源提供的摘要（若有）
  publishedAt: string;   // ISO 8601 字串（來源原始）
  author?: string;
  sourceName: string;    // 媒體名稱（e.g., "CoinDesk"）
  imageUrl?: string;
  tags?: string[];       // 來源提供的標籤
}

// ─── 標準化後項目 ─────────────────────────────────────────────────────
export interface NewsItem {
  id: string;            // SHA-256(url) hex 前 16 chars
  url: string;
  title: string;
  content: string;       // 無全文時由 title + summary 合併
  publishedAt: Date;     // 轉換為 Date 物件（UTC）
  sourceName: string;
  sourceType: SourceType;
  author?: string;
  imageUrl?: string;
  tags: string[];
}

// ─── AI 分析後項目 ────────────────────────────────────────────────────
export interface AnalyzedNewsItem extends NewsItem {
  importanceScore: number;       // 1-10，AI 評分
  category: NewsCategory;
  aiSummary: string;             // AI 生成的繁體中文摘要（100-150 字）
  relatedTickers: string[];      // e.g., ["BTC", "ETH"]
  sentiment: Sentiment;
  deepAnalysis?: string;         // AI 深度分析報告（400-600 字，基於原文抓取）
}

// ─── 每日報告 ─────────────────────────────────────────────────────────
export interface DailyReport {
  reportDate: string;            // YYYY-MM-DD（Asia/Taipei）
  generatedAt: Date;
  timeWindowFrom: Date;
  timeWindowTo: Date;
  totalCollected: number;        // 收集總數
  afterDedup: number;            // 去重後數量
  topStories: AnalyzedNewsItem[];     // 精選 10 則（依重要度排序）
  executiveSummary: string;      // AI 整體摘要（300 字內）
  sources: string[];             // 使用的來源清單
  mdReportUrl?: string;          // GitHub Gist 線上 MD 報告連結（選填）
}

// ─── 收集結果 ─────────────────────────────────────────────────────────
export interface CollectionResult {
  source: SourceType;
  items: RawNewsItem[];
  success: boolean;
  error?: string;
  durationMs: number;
}

// ─── 自訂錯誤 ─────────────────────────────────────────────────────────
export class AllSourcesFailedError extends Error {
  constructor(message = '所有新聞來源均失敗') {
    super(message);
    this.name = 'AllSourcesFailedError';
  }
}

export class ConfigValidationError extends Error {
  constructor(missingKey: string) {
    super(`缺少必要環境變數：${missingKey}`);
    this.name = 'ConfigValidationError';
  }
}
