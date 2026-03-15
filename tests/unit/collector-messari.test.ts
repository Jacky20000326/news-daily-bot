// 設定環境變數（必須在 import 之前）
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';
process.env.MESSARI_API_KEY = 'test-messari-key';

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

import { fetchMessari } from '../../src/collector/messari';
import { httpClient } from '../../src/utils/retry';

// ─── 輔助函式 ─────────────────────────────────────────────────────────────────

/** 建立 24 小時時間窗 */
function buildWindow(): TimeWindow {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return { from, to: now };
}

/** 建立標準 Messari 文章物件（預設時間為 1 小時前，確保在時間窗內） */
function buildArticle(overrides: Record<string, unknown> = {}) {
  const publishedAt = new Date(Date.now() - 60 * 60 * 1000);
  return {
    id: 'messari-001',
    title: 'Bitcoin hits 100k',
    content: 'Full article content here.',
    url: 'https://messari.io/article/bitcoin-100k',
    author: { name: 'Test Author' },
    published_at: publishedAt.toISOString(),
    tags: ['Bitcoin', 'BTC'],
    references: [],
    ...overrides,
  };
}

/** 建立標準 Messari 成功回應 */
function buildResponse(articles: unknown[]) {
  return {
    data: {
      data: articles,
    },
  };
}

// ─── 測試案例 ──────────────────────────────────────────────────────────────────

describe('fetchMessari()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('API 回傳 1 篇文章時正確轉為 RawNewsItem', async () => {
    const window = buildWindow();
    const article = buildArticle();
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchMessari(window);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      url: article.url,
      title: article.title,
      publishedAt: article.published_at,
    });
  });

  it('轉換結果的 source 為 "messari"', async () => {
    const window = buildWindow();
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([buildArticle()]));

    const result = await fetchMessari(window);

    expect(result[0].source).toBe('messari');
  });

  it('轉換結果的 rawId 為 article.id', async () => {
    const window = buildWindow();
    const article = buildArticle({ id: 'unique-id-123' });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchMessari(window);

    expect(result[0].rawId).toBe('unique-id-123');
  });

  it('轉換結果的 sourceName 為 "Messari"', async () => {
    const window = buildWindow();
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([buildArticle()]));

    const result = await fetchMessari(window);

    expect(result[0].sourceName).toBe('Messari');
  });

  it('應正確帶入 author 欄位', async () => {
    const window = buildWindow();
    const article = buildArticle({ author: { name: 'Ryan Selkis' } });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchMessari(window);

    expect(result[0].author).toBe('Ryan Selkis');
  });

  it('author 為 null 時不帶入 author 欄位', async () => {
    const window = buildWindow();
    const article = buildArticle({ author: null });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchMessari(window);

    expect(result[0].author).toBeUndefined();
  });

  it('應正確帶入 tags 欄位', async () => {
    const window = buildWindow();
    const article = buildArticle({ tags: ['DeFi', 'Ethereum'] });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchMessari(window);

    expect(result[0].tags).toEqual(['DeFi', 'Ethereum']);
  });

  it('tags 為空陣列時不帶入 tags 欄位', async () => {
    const window = buildWindow();
    const article = buildArticle({ tags: [] });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchMessari(window);

    expect(result[0].tags).toBeUndefined();
  });

  it('跳過 title 缺失的文章', async () => {
    const window = buildWindow();
    const article = buildArticle({ title: '' });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchMessari(window);

    expect(result).toHaveLength(0);
  });

  it('跳過 url 缺失的文章', async () => {
    const window = buildWindow();
    const article = buildArticle({ url: '' });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchMessari(window);

    expect(result).toHaveLength(0);
  });

  it('跳過 published_at 缺失的文章', async () => {
    const window = buildWindow();
    const article = buildArticle({ published_at: '' });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchMessari(window);

    expect(result).toHaveLength(0);
  });

  it('data 為空陣列時回傳空陣列', async () => {
    const window = buildWindow();
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([]));

    const result = await fetchMessari(window);

    expect(result).toHaveLength(0);
  });

  it('時間窗外的文章（太舊）被過濾並停止分頁', async () => {
    const window = buildWindow();
    const oldDate = new Date(window.from.getTime() - 24 * 60 * 60 * 1000);
    const article = buildArticle({ published_at: oldDate.toISOString() });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchMessari(window);

    expect(result).toHaveLength(0);
  });

  it('時間窗外的文章（未來）被跳過', async () => {
    const window = buildWindow();
    const futureDate = new Date(window.to.getTime() + 24 * 60 * 60 * 1000);
    const article = buildArticle({ published_at: futureDate.toISOString() });
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([article]));

    const result = await fetchMessari(window);

    expect(result).toHaveLength(0);
  });

  it('帶 x-messari-api-key header 發送請求', async () => {
    const window = buildWindow();
    vi.mocked(httpClient.get).mockResolvedValueOnce(buildResponse([]));

    await fetchMessari(window);

    const callArgs = vi.mocked(httpClient.get).mock.calls[0];
    expect(callArgs[0]).toBe('https://api.messari.io/v1/news');
    expect(callArgs[1]).toHaveProperty('headers.x-messari-api-key');
  });

  it('多頁收集：第二頁無資料時停止', async () => {
    const window = buildWindow();
    // 第一頁 50 筆（觸發分頁）
    const articles = Array.from({ length: 50 }, (_, i) =>
      buildArticle({ id: `article-${i}`, url: `https://messari.io/article/${i}` }),
    );
    vi.mocked(httpClient.get)
      .mockResolvedValueOnce(buildResponse(articles))
      .mockResolvedValueOnce(buildResponse([]));

    const result = await fetchMessari(window);

    expect(result).toHaveLength(50);
    expect(httpClient.get).toHaveBeenCalledTimes(2);
  });
});
