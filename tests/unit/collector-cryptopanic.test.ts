// 設定環境變數（必須在 import 之前）
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TimeWindow } from '../../src/types';

// ─── Mock 設定（使用 vi.hoisted 確保 mock 提升） ──────────────────────────────

const mocks = vi.hoisted(() => ({
  httpGet: vi.fn(),
  cryptoPanicToken: { value: 'test-token' },
}));

vi.mock('../../src/utils/retry', () => ({
  httpClient: { get: mocks.httpGet },
}));

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/config/index', () => ({
  config: {
    sources: {
      get cryptoPanicToken() {
        return mocks.cryptoPanicToken.value;
      },
      newsApiKey: 'test-key',
      enableRss: false,
      enableCoinGecko: false,
    },
    ai: {
      apiKey: 'test-key',
      model: 'gemini-1.5-flash',
      maxTokens: 4096,
      temperature: 0.3,
    },
    email: {
      senderEmail: 'test@example.com',
      recipients: ['test@example.com'],
      alertEmail: '',
      smtp: { host: 'smtp.gmail.com', port: 587, user: '', pass: '' },
    },
    scheduler: { timezone: 'Asia/Taipei', reportHour: 9 },
    app: { dryRun: false, logLevel: 'info', nodeEnv: 'test' },
    publisher: { githubToken: '', githubOwner: '', githubRepo: '' },
  },
}));

import { fetchCryptoPanic } from '../../src/collector/cryptopanic';

// ─── 輔助函式 ─────────────────────────────────────────────────────────────────

/** 建立 24 小時時間窗 */
function buildWindow(): TimeWindow {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return { from, to: now };
}

/** 建立標準 CryptoPanic post 物件（預設時間為 1 小時前，確保在時間窗內） */
function buildPost(overrides: Record<string, unknown> = {}) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return {
    kind: 'news',
    domain: 'coindesk.com',
    source: { title: 'CoinDesk', region: 'en', domain: 'coindesk.com', path: null },
    title: 'Bitcoin News',
    published_at: oneHourAgo.toISOString(),
    slug: 'bitcoin-news',
    currencies: [{ code: 'BTC', title: 'Bitcoin', slug: 'bitcoin', url: 'https://example.com' }],
    id: 12345,
    url: 'https://example.com/btc-news',
    created_at: oneHourAgo.toISOString(),
    ...overrides,
  };
}

/** 建立標準 CryptoPanic 成功回應 */
function buildResponse(results: unknown[], next: string | null = null) {
  return {
    data: {
      count: results.length,
      next,
      previous: null,
      results,
    },
  };
}

// ─── 測試案例 ──────────────────────────────────────────────────────────────────

describe('fetchCryptoPanic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 預設 token 有值
    mocks.cryptoPanicToken.value = 'test-token';
  });

  it('token 未設定時回傳空陣列', async () => {
    mocks.cryptoPanicToken.value = '';
    const window = buildWindow();

    const result = await fetchCryptoPanic(window);

    expect(result).toHaveLength(0);
    // 確認沒有呼叫 API
    expect(mocks.httpGet).not.toHaveBeenCalled();
  });

  it('API 回傳 1 筆 post 時正確轉為 RawNewsItem', async () => {
    const window = buildWindow();
    const post = buildPost();
    mocks.httpGet.mockResolvedValueOnce(buildResponse([post]));

    const result = await fetchCryptoPanic(window);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      url: post.url,
      title: post.title,
      publishedAt: post.published_at,
    });
  });

  it('轉換結果的 source 為 "cryptopanic"', async () => {
    const window = buildWindow();
    mocks.httpGet.mockResolvedValueOnce(buildResponse([buildPost()]));

    const result = await fetchCryptoPanic(window);

    expect(result[0].source).toBe('cryptopanic');
  });

  it('轉換結果的 rawId 為 String(post.id)', async () => {
    const window = buildWindow();
    const post = buildPost({ id: 99999 });
    mocks.httpGet.mockResolvedValueOnce(buildResponse([post]));

    const result = await fetchCryptoPanic(window);

    expect(result[0].rawId).toBe('99999');
  });

  it('currencies 存在時轉為小寫 tags', async () => {
    const window = buildWindow();
    const post = buildPost({
      currencies: [
        { code: 'BTC', title: 'Bitcoin', slug: 'bitcoin', url: 'https://example.com' },
        { code: 'ETH', title: 'Ethereum', slug: 'ethereum', url: 'https://example.com' },
      ],
    });
    mocks.httpGet.mockResolvedValueOnce(buildResponse([post]));

    const result = await fetchCryptoPanic(window);

    expect(result[0].tags).toEqual(['btc', 'eth']);
  });

  it('跳過 url 為空的 post', async () => {
    const window = buildWindow();
    const post = buildPost({ url: '' });
    mocks.httpGet.mockResolvedValueOnce(buildResponse([post]));

    const result = await fetchCryptoPanic(window);

    expect(result).toHaveLength(0);
  });

  it('跳過 published_at 為空的 post', async () => {
    const window = buildWindow();
    const post = buildPost({ published_at: '' });
    mocks.httpGet.mockResolvedValueOnce(buildResponse([post]));

    const result = await fetchCryptoPanic(window);

    expect(result).toHaveLength(0);
  });

  it('超出時間窗下界時停止分頁', async () => {
    const window = buildWindow();
    // 第一頁：一篇太舊的文章，應觸發停止分頁
    const oldDate = new Date(window.from.getTime() - 60 * 60 * 1000);
    const oldPost = buildPost({ published_at: oldDate.toISOString() });
    mocks.httpGet.mockResolvedValueOnce(buildResponse([oldPost], 'https://cryptopanic.com/api/v1/posts/?page=2'));

    const result = await fetchCryptoPanic(window);

    expect(result).toHaveLength(0);
    // 只呼叫了一次 API（沒有繼續分頁）
    expect(mocks.httpGet).toHaveBeenCalledTimes(1);
  });
});
