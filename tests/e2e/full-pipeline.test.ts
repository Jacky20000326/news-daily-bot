/**
 * E2E 端到端測試：完整 pipeline 流程驗證
 *
 * 驗證整個 pipeline 從收集到寄送的完整流程。
 * 所有外部依賴（API、SMTP）均使用 mock，但內部模組邏輯（normalizer、deduplicator、
 * reporter 等）真實執行。
 *
 * AI 呼叫被 mock 後，ranker 的 JSON.parse 會失敗，自動退回關鍵字備援分類。
 * 這是預期的 graceful degradation 行為。
 */

// ─── 環境變數設定（必須在所有 import 之前） ─────────────────────────────────────
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'sender@example.com';
process.env.EMAIL_RECIPIENTS = 'recipient@example.com';
process.env.SMTP_USER = 'sender@example.com';
process.env.SMTP_PASS = 'test-pass';
process.env.DRY_RUN = 'false';

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ─── Mock：Nodemailer（hoisted） ────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  sendMail: vi.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: mocks.sendMail,
    }),
  },
}));

// ─── Mock：Google Gemini AI SDK ─────────────────────────────────────────────────
vi.mock('@google/generative-ai', () => {
  // generateContent 會被 ranker 與 summarizer 呼叫。
  // ranker 嘗試 JSON.parse text() 的結果，失敗後走關鍵字備援（預期行為）。
  // summarizer 直接使用 text() 回傳的字串作為摘要。
  const mockGenerateContent = vi.fn().mockImplementation(() => {
    return Promise.resolve({
      response: {
        candidates: [{ finishReason: 'STOP' }],
        text: () => {
          return '這是 AI 生成的繁體中文摘要，比特幣今日表現強勁。';
        },
        promptFeedback: null,
      },
    });
  });

  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    })),
  };
});

// ─── Mock：HTTP Client（NewsAPI 資料來源） ──────────────────────────
vi.mock('../../src/utils/retry', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/utils/retry')>();
  return {
    ...original,
    httpClient: {
      get: vi.fn(),
      put: vi.fn(),
      post: vi.fn(),
    },
  };
});


// ─── Mock：Publisher（GitHub Pages） ─────────────────────────────────────────────
vi.mock('../../src/publisher/index', () => ({
  getReportPageUrl: vi.fn().mockReturnValue(
    'https://test.github.io/crypto/crypto-daily-2026-03-07.html'
  ),
  publishToGitHubPages: vi.fn().mockResolvedValue(
    'https://test.github.io/crypto/crypto-daily-2026-03-07.html'
  ),
}));

// ─── Import 被測主程式與工具 ────────────────────────────────────────────────────
import { runDailyPipeline } from '../../src/index';
import { httpClient } from '../../src/utils/retry';
import type { DailyReport, NewsCategory } from '../../src/types';

// ─── 合法分類清單 ──────────────────────────────────────────────────────────────
const VALID_CATEGORIES: NewsCategory[] = [
  'market',
  'regulation',
  'technology',
  'defi',
  'nft',
  'security',
  'macro',
  'exchange',
  'other',
];

// ─── 測試資料：publishedAt 設定在時間窗內（現在時間減 6 小時） ──────────────────
const inWindowTime = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

const mockArticles = [
  {
    source: { id: null, name: 'CoinDesk' },
    author: 'Alice',
    title: 'Bitcoin hits new ATH of $150,000',
    description: 'BTC surges past previous records',
    url: 'https://example.com/btc-ath',
    urlToImage: null,
    publishedAt: inWindowTime,
    content: 'Bitcoin reached a new all-time high today, surpassing $150,000.',
  },
  {
    source: { id: null, name: 'CoinTelegraph' },
    author: 'Bob',
    title: 'Ethereum 2.0 staking grows rapidly',
    description: 'ETH staking deposits increase 200%',
    url: 'https://example.com/eth-staking',
    urlToImage: null,
    publishedAt: inWindowTime,
    content: 'Ethereum staking deposits increased by 200% in the last month.',
  },
  {
    source: { id: null, name: 'The Block' },
    author: 'Carol',
    title: 'SEC approves new DeFi regulation framework',
    description: 'New rules for decentralized finance',
    url: 'https://example.com/sec-defi',
    urlToImage: null,
    publishedAt: inWindowTime,
    content: 'SEC announced a comprehensive framework for regulating DeFi protocols.',
  },
  {
    source: { id: null, name: 'Decrypt' },
    author: 'Dave',
    title: 'NFT marketplace volume hits $5 billion',
    description: 'NFT trading surges across platforms',
    url: 'https://example.com/nft-volume',
    urlToImage: null,
    publishedAt: inWindowTime,
    content: 'NFT marketplace trading volume reached $5 billion this quarter.',
  },
  {
    source: { id: null, name: 'CryptoSlate' },
    author: 'Eve',
    title: 'Major exchange Binance launches new security feature',
    description: 'Enhanced security measures for users',
    url: 'https://example.com/binance-security',
    urlToImage: null,
    publishedAt: inWindowTime,
    content: 'Binance has rolled out enhanced security features for all accounts.',
  },
  {
    source: { id: null, name: 'Bloomberg Crypto' },
    author: 'Frank',
    title: 'Federal Reserve rate decision impacts crypto market',
    description: 'Macro factors drive crypto volatility',
    url: 'https://example.com/fed-crypto',
    urlToImage: null,
    publishedAt: inWindowTime,
    content: 'The Federal Reserve rate decision caused significant crypto market movement.',
  },
  {
    source: { id: null, name: 'CoinDesk' },
    author: 'Grace',
    title: 'Solana blockchain upgrades to improve throughput',
    description: 'Technology advancement for Solana network',
    url: 'https://example.com/solana-upgrade',
    urlToImage: null,
    publishedAt: inWindowTime,
    content: 'Solana completed a major network upgrade improving transaction throughput.',
  },
  {
    source: { id: null, name: 'The Defiant' },
    author: 'Hank',
    title: 'Uniswap v4 introduces hook system for DeFi innovation',
    description: 'DeFi protocol upgrade brings new possibilities',
    url: 'https://example.com/uniswap-v4',
    urlToImage: null,
    publishedAt: inWindowTime,
    content: 'Uniswap v4 launch introduces a new hook system enabling custom pool logic.',
  },
];

// ─── 測試主體 ───────────────────────────────────────────────────────────────────

describe('E2E：完整 pipeline 端到端測試', () => {
  let report: DailyReport;

  beforeAll(async () => {
    // 設定 httpClient.get mock 回傳 NewsAPI 格式資料
    const mockGet = httpClient.get as ReturnType<typeof vi.fn>;
    mockGet.mockResolvedValue({
      data: {
        status: 'ok',
        totalResults: mockArticles.length,
        articles: mockArticles,
      },
    });

    // 執行完整 pipeline
    report = await runDailyPipeline();
  }, 60_000); // 60 秒逾時（包含 AI retry 延遲等）

  // ── 測試 1：pipeline 不拋出錯誤，正常回傳 ──
  it('runDailyPipeline() 應成功執行不拋出錯誤', () => {
    expect(report).toBeDefined();
  });

  // ── 測試 2：回傳 DailyReport 物件包含所有必要欄位 ──
  it('回傳的 DailyReport 應包含所有必要欄位', () => {
    expect(report).toHaveProperty('reportDate');
    expect(report).toHaveProperty('generatedAt');
    expect(report).toHaveProperty('timeWindowFrom');
    expect(report).toHaveProperty('timeWindowTo');
    expect(report).toHaveProperty('totalCollected');
    expect(report).toHaveProperty('afterDedup');
    expect(report).toHaveProperty('topStories');
    expect(report).toHaveProperty('executiveSummary');
    expect(report).toHaveProperty('sources');

    // 欄位型別驗證
    expect(typeof report.reportDate).toBe('string');
    expect(report.generatedAt).toBeInstanceOf(Date);
    expect(report.timeWindowFrom).toBeInstanceOf(Date);
    expect(report.timeWindowTo).toBeInstanceOf(Date);
    expect(typeof report.totalCollected).toBe('number');
    expect(typeof report.afterDedup).toBe('number');
    expect(Array.isArray(report.topStories)).toBe(true);
    expect(typeof report.executiveSummary).toBe('string');
    expect(Array.isArray(report.sources)).toBe(true);
  });

  // ── 測試 3：topStories 數量不超過 10 ──
  it('topStories 數量應不超過 10', () => {
    expect(report.topStories.length).toBeLessThanOrEqual(10);
  });

  // ── 測試 4：每筆 topStory 有 importanceScore（1-10） ──
  it('每筆 topStory 應有 importanceScore 且值在 1-10 之間', () => {
    for (const story of report.topStories) {
      expect(story.importanceScore).toBeGreaterThanOrEqual(1);
      expect(story.importanceScore).toBeLessThanOrEqual(10);
    }
  });

  // ── 測試 5：每筆 topStory 有合法 category ──
  it('每筆 topStory 的 category 應為 9 個合法分類之一', () => {
    for (const story of report.topStories) {
      expect(VALID_CATEGORIES).toContain(story.category);
    }
  });

  // ── 測試 6：每筆 topStory 有 sentiment ──
  it('每筆 topStory 的 sentiment 應為 positive / negative / neutral 之一', () => {
    const validSentiments = ['positive', 'negative', 'neutral'];
    for (const story of report.topStories) {
      expect(validSentiments).toContain(story.sentiment);
    }
  });

  // ── 測試 7：每筆 topStory 的 category 為合法分類 ──
  it('每筆 topStory 的 category 應為合法分類', () => {
    for (const story of report.topStories) {
      expect(VALID_CATEGORIES).toContain(story.category);
    }
  });

  // ── 測試 8：executiveSummary 為字串 ──
  it('executiveSummary 應為字串（可能為空字串，因 AI mock 回傳非正式格式）', () => {
    expect(typeof report.executiveSummary).toBe('string');
  });

  // ── 測試 9：sendMail 被呼叫一次（DRY_RUN = false） ──
  it('sendMail 應被呼叫一次（DRY_RUN 為 false）', () => {
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });

  // ── 測試 10：sendMail 的 html 參數包含 topStories 的標題 ──
  it('sendMail 的 html 參數應包含 topStories 的標題', () => {
    const callArgs = mocks.sendMail.mock.calls[0][0];
    const html: string = callArgs.html;

    // 驗證寄出的 HTML 包含 topStories 中每筆新聞的標題
    for (const story of report.topStories) {
      expect(html).toContain(story.title);
    }
  });
});
