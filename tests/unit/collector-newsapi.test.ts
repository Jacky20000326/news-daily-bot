// 設定環境變數（必須在 import 之前）
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TimeWindow } from '../../src/types';

// ─── Mock 設定 ─────────────────────────────────────────────────────────────────

vi.mock('../../src/utils/retry', () => ({
  httpClient: {
    get: vi.fn(),
  },
}));

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { fetchNewsAPI } from '../../src/collector/newsapi';
import { httpClient } from '../../src/utils/retry';

// ─── 輔助函式 ─────────────────────────────────────────────────────────────────

/** 建立 24 小時時間窗 */
function buildWindow(): TimeWindow {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return { from, to: now };
}

/** 建立標準 NewsAPI 文章物件（預設時間為 1 小時前，確保在時間窗內） */
function buildArticle(overrides: Record<string, unknown> = {}) {
  const now = new Date(Date.now() - 60 * 60 * 1000);
  return {
    source: { id: null, name: 'CoinDesk' },
    author: 'Test',
    title: 'Bitcoin hits 100k',
    description: 'BTC surges.',
    url: 'https://example.com/btc',
    urlToImage: 'https://example.com/img.jpg',
    publishedAt: now.toISOString(),
    content: 'Full content here.',
    ...overrides,
  };
}

/** 建立標準 NewsAPI 成功回應 */
function buildResponse(articles: unknown[], totalResults?: number) {
  return {
    data: {
      status: 'ok',
      totalResults: totalResults ?? articles.length,
      articles,
    },
  };
}

// ─── 測試案例 ──────────────────────────────────────────────────────────────────

describe('fetchNewsAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('API 回傳 1 篇文章時正確轉為 RawNewsItem', async () => {
    const window = buildWindow();
    const article = buildArticle();
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchNewsAPI(window);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      url: article.url,
      title: article.title,
      publishedAt: article.publishedAt,
    });
  });

  it('轉換結果的 source 為 "newsapi"', async () => {
    const window = buildWindow();
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([buildArticle()]));

    const result = await fetchNewsAPI(window);

    expect(result[0].source).toBe('newsapi');
  });

  it('轉換結果的 rawId 為 article.url', async () => {
    const window = buildWindow();
    const article = buildArticle({ url: 'https://example.com/unique-article' });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchNewsAPI(window);

    expect(result[0].rawId).toBe('https://example.com/unique-article');
  });

  it('轉換結果的 sourceName 為 article.source.name', async () => {
    const window = buildWindow();
    const article = buildArticle();
    article.source = { id: null, name: 'The Block' };
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchNewsAPI(window);

    expect(result[0].sourceName).toBe('The Block');
  });

  it('跳過 title 為 null 的文章', async () => {
    const window = buildWindow();
    const article = buildArticle({ title: null });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchNewsAPI(window);

    expect(result).toHaveLength(0);
  });

  it('跳過 url 為 null 的文章', async () => {
    const window = buildWindow();
    const article = buildArticle({ url: null });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchNewsAPI(window);

    expect(result).toHaveLength(0);
  });

  it('跳過 publishedAt 為 null 的文章', async () => {
    const window = buildWindow();
    const article = buildArticle({ publishedAt: null });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchNewsAPI(window);

    expect(result).toHaveLength(0);
  });

  it('status 不是 "ok" 時停止並回傳空陣列', async () => {
    const window = buildWindow();
    vi.mocked(httpClient.get).mockResolvedValueOnce({
      data: {
        status: 'error',
        totalResults: 0,
        articles: [],
      },
    });

    const result = await fetchNewsAPI(window);

    expect(result).toHaveLength(0);
  });

  it('articles 為空陣列時回傳空陣列', async () => {
    const window = buildWindow();
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([], 0));

    const result = await fetchNewsAPI(window);

    expect(result).toHaveLength(0);
  });

  it('時間窗外的文章被過濾掉', async () => {
    const window = buildWindow();
    // 建立一篇超出時間窗（48 小時前）的文章
    const oldDate = new Date(window.from.getTime() - 24 * 60 * 60 * 1000);
    const article = buildArticle({ publishedAt: oldDate.toISOString() });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchNewsAPI(window);

    expect(result).toHaveLength(0);
  });
});
