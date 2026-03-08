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

const mocks = vi.hoisted(() => ({
  parseURL: vi.fn(),
}));

vi.mock('rss-parser', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      parseURL: mocks.parseURL,
    })),
  };
});

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { fetchRSSFeeds } from '../../src/collector/rss';

// ─── 輔助函式 ─────────────────────────────────────────────────────────────────

/** 建立 24 小時時間窗 */
function buildWindow(): TimeWindow {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return { from, to: now };
}

/** 建立標準 RSS item 物件（預設時間為 1 小時前，確保在時間窗內） */
function buildItem(overrides: Record<string, unknown> = {}) {
  const now = new Date(Date.now() - 60 * 60 * 1000);
  return {
    title: 'Bitcoin Article',
    link: 'https://coindesk.com/article',
    isoDate: now.toISOString(),
    pubDate: now.toUTCString(),
    content: 'Article content',
    contentSnippet: 'Snippet',
    creator: 'Author',
    category: 'crypto',
    ...overrides,
  };
}

/** 建立標準 RSS feed 回應 */
function buildFeedResponse(items: unknown[]) {
  return { items };
}

// ─── 測試案例 ──────────────────────────────────────────────────────────────────

describe('fetchRSSFeeds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('RSS feed 回傳 1 筆 item 時正確轉為 RawNewsItem', async () => {
    const window = buildWindow();
    const item = buildItem();
    // 所有 5 個 feed 都回傳同一筆 item
    mocks.parseURL.mockResolvedValue(buildFeedResponse([item]));

    const result = await fetchRSSFeeds(window);

    // 5 個 feed 各回傳 1 筆 = 5 筆
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toMatchObject({
      url: item.link,
      title: item.title,
    });
  });

  it('轉換結果的 source 為 "rss"', async () => {
    const window = buildWindow();
    mocks.parseURL.mockResolvedValue(buildFeedResponse([buildItem()]));

    const result = await fetchRSSFeeds(window);

    expect(result[0].source).toBe('rss');
  });

  it('轉換結果的 rawId 為 item.link', async () => {
    const window = buildWindow();
    const item = buildItem({ link: 'https://coindesk.com/unique-article' });
    mocks.parseURL.mockResolvedValue(buildFeedResponse([item]));

    const result = await fetchRSSFeeds(window);

    expect(result[0].rawId).toBe('https://coindesk.com/unique-article');
  });

  it('跳過沒有 link 的 item', async () => {
    const window = buildWindow();
    // 一筆有 link，一筆沒有 link
    const validItem = buildItem();
    const noLinkItem = buildItem({ link: undefined });
    mocks.parseURL.mockResolvedValue(buildFeedResponse([noLinkItem, validItem]));

    const result = await fetchRSSFeeds(window);

    // 每個 feed 只有 validItem 被保留
    for (const r of result) {
      expect(r.url).toBeTruthy();
    }
  });

  it('跳過沒有 title 的 item', async () => {
    const window = buildWindow();
    const noTitleItem = buildItem({ title: '' });
    mocks.parseURL.mockResolvedValue(buildFeedResponse([noTitleItem]));

    const result = await fetchRSSFeeds(window);

    expect(result).toHaveLength(0);
  });

  it('跳過無法解析發布時間的 item', async () => {
    const window = buildWindow();
    // isoDate 和 pubDate 都是空字串
    const badDateItem = buildItem({ isoDate: undefined, pubDate: undefined });
    mocks.parseURL.mockResolvedValue(buildFeedResponse([badDateItem]));

    const result = await fetchRSSFeeds(window);

    expect(result).toHaveLength(0);
  });

  it('時間窗外的 item 被過濾', async () => {
    const window = buildWindow();
    // 建立一篇超出時間窗（48 小時前）的 item
    const oldDate = new Date(window.from.getTime() - 24 * 60 * 60 * 1000);
    const oldItem = buildItem({
      isoDate: oldDate.toISOString(),
      pubDate: oldDate.toUTCString(),
    });
    mocks.parseURL.mockResolvedValue(buildFeedResponse([oldItem]));

    const result = await fetchRSSFeeds(window);

    expect(result).toHaveLength(0);
  });

  it('單一 feed 失敗時其他 feed 仍正常回傳', async () => {
    const window = buildWindow();
    const validItem = buildItem();
    let callCount = 0;

    mocks.parseURL.mockImplementation(() => {
      callCount++;
      // 第一個 feed 拋出錯誤
      if (callCount === 1) {
        return Promise.reject(new Error('Network error'));
      }
      // 其餘 feed 正常回傳
      return Promise.resolve(buildFeedResponse([validItem]));
    });

    const result = await fetchRSSFeeds(window);

    // 5 個 feed 中 1 個失敗，其餘 4 個各回傳 1 筆 = 4 筆
    expect(result).toHaveLength(4);
    // 確認所有結果都是有效的 RawNewsItem
    for (const r of result) {
      expect(r.source).toBe('rss');
      expect(r.url).toBeTruthy();
    }
  });
});
