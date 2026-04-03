// 設定測試所需環境變數（必須在任何 src 模組 import 前設定）
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deduplicate, deduplicateByUrl, deduplicateByTitle, deduplicateByHistory } from '../../src/deduplicator/index';
import type { NewsItem } from '../../src/types';
import { mockNewsItem } from '../helpers/mocks';
import * as historyModule from '../../src/deduplicator/history';

describe('deduplicateByUrl()', () => {
  it('能移除相同 URL 的重複項目', () => {
    const item1 = mockNewsItem({
      id: 'id001',
      url: 'https://example.com/news/article-one',
      title: 'Article One',
    });
    const item2 = mockNewsItem({
      id: 'id002',
      url: 'https://example.com/news/article-one',
      title: 'Article One Duplicate',
    });

    const result = deduplicateByUrl([item1, item2]);
    expect(result).toHaveLength(1);
  });

  it('URL 正規化：移除 utm_source 參數後視為同一筆', () => {
    const item1 = mockNewsItem({
      id: 'id001',
      url: 'https://example.com/a',
    });
    const item2 = mockNewsItem({
      id: 'id002',
      url: 'https://example.com/a?utm_source=twitter',
    });

    const result = deduplicateByUrl([item1, item2]);
    expect(result).toHaveLength(1);
  });

  it('URL 正規化：trailing slash 處理', () => {
    const item1 = mockNewsItem({
      id: 'id001',
      url: 'https://example.com/a',
    });
    const item2 = mockNewsItem({
      id: 'id002',
      url: 'https://example.com/a/',
    });

    const result = deduplicateByUrl([item1, item2]);
    expect(result).toHaveLength(1);
  });

  it('URL 正規化：同時有 UTM 參數和 trailing slash', () => {
    const item1 = mockNewsItem({
      id: 'id001',
      url: 'https://example.com/news/article',
    });
    const item2 = mockNewsItem({
      id: 'id002',
      url: 'https://example.com/news/article/?utm_medium=social&utm_campaign=test',
    });

    const result = deduplicateByUrl([item1, item2]);
    expect(result).toHaveLength(1);
  });

  it('多個不同 URL 的項目都被保留', () => {
    const items: NewsItem[] = [
      mockNewsItem({ id: 'id001', url: 'https://example.com/news/one', title: 'News One' }),
      mockNewsItem({ id: 'id002', url: 'https://example.com/news/two', title: 'News Two' }),
      mockNewsItem({ id: 'id003', url: 'https://example.com/news/three', title: 'News Three' }),
    ];

    const result = deduplicateByUrl(items);
    expect(result).toHaveLength(3);
  });
});

describe('deduplicateByTitle()', () => {
  it('完全相同的標題會被去重', async () => {
    const baseDate = new Date('2024-01-01T10:00:00Z');
    const laterDate = new Date('2024-01-01T12:00:00Z');

    const item1 = mockNewsItem({
      id: 'id001',
      url: 'https://source-a.com/article',
      title: 'Bitcoin surges past $100K as institutional demand soars',
      publishedAt: baseDate,
    });
    const item2 = mockNewsItem({
      id: 'id002',
      url: 'https://source-b.com/article',
      title: 'Bitcoin surges past $100K as institutional demand soars',
      publishedAt: laterDate,
    });

    const result = await deduplicateByTitle([item1, item2]);
    expect(result).toHaveLength(1);
    // 保留較早的
    expect(result[0].id).toBe('id001');
  }, 30000);

  it('語義相似的改寫標題會被去重（主被動語態改寫）', async () => {
    const item1 = mockNewsItem({
      id: 'id001',
      url: 'https://source-a.com/eth',
      title: 'Ethereum ETF approved by SEC',
      publishedAt: new Date('2024-01-01T10:00:00Z'),
    });
    const item2 = mockNewsItem({
      id: 'id002',
      url: 'https://source-b.com/eth',
      title: 'SEC approves Ethereum ETF',
      publishedAt: new Date('2024-01-01T12:00:00Z'),
    });

    const result = await deduplicateByTitle([item1, item2]);
    expect(result).toHaveLength(1);
  }, 30000);

  it('語義相似的改寫標題會被去重（措辭不同但同一事件）', async () => {
    const item1 = mockNewsItem({
      id: 'id001',
      url: 'https://source-a.com/btc',
      title: 'Bitcoin price hits $100K for the first time ever',
      publishedAt: new Date('2024-01-01T10:00:00Z'),
    });
    const item2 = mockNewsItem({
      id: 'id002',
      url: 'https://source-b.com/btc',
      title: 'Bitcoin hits $100,000 for the first time in history',
      publishedAt: new Date('2024-01-01T12:00:00Z'),
    });

    const result = await deduplicateByTitle([item1, item2]);
    expect(result).toHaveLength(1);
  }, 30000);

  it('同一事件不同角度的報導會被去重', async () => {
    const item1 = mockNewsItem({
      id: 'id001',
      url: 'https://source-a.com/drift1',
      title: 'DRIFT Hacked: 280M$ Loss and Price Collapse',
      content: 'Drift Protocol suffered a major exploit today, with attackers draining approximately $280 million from the platform. The DRIFT token price collapsed following the breach.',
      publishedAt: new Date('2024-01-01T10:00:00Z'),
    });
    const item2 = mockNewsItem({
      id: 'id002',
      url: 'https://source-b.com/drift2',
      title: 'Drift Protocol Hack Drains $270M, TVL Halves Amid Security Breach',
      content: 'Drift Protocol has been exploited for roughly $270 million, causing total value locked to drop by more than 50%. The hack is one of the largest DeFi exploits this year.',
      publishedAt: new Date('2024-01-01T11:00:00Z'),
    });
    const item3 = mockNewsItem({
      id: 'id003',
      url: 'https://source-c.com/drift3',
      title: 'Drift Protocol Hack: Staggering $285M in Stolen Funds Swapped for Ethereum',
      content: 'The attacker behind the Drift Protocol exploit has swapped approximately $285 million in stolen funds for Ethereum, according to on-chain data. The breach targeted multiple liquidity pools.',
      publishedAt: new Date('2024-01-01T12:00:00Z'),
    });

    const result = await deduplicateByTitle([item1, item2, item3]);
    expect(result).toHaveLength(1);
    // 保留最早的
    expect(result[0].id).toBe('id001');
  }, 30000);

  it('完全不同主題的標題不被去重', async () => {
    const item1 = mockNewsItem({
      id: 'id001',
      url: 'https://example.com/news/article-one',
      title: 'Bitcoin price reaches new all time high',
    });
    const item2 = mockNewsItem({
      id: 'id002',
      url: 'https://example.com/news/article-two',
      title: 'Ethereum network upgrade successfully completed',
    });
    const item3 = mockNewsItem({
      id: 'id003',
      url: 'https://example.com/news/article-three',
      title: 'SEC announces new cryptocurrency regulations',
    });

    const result = await deduplicateByTitle([item1, item2, item3]);
    expect(result).toHaveLength(3);
  }, 30000);

  it('空陣列輸入時正確處理', async () => {
    const result = await deduplicateByTitle([]);
    expect(result).toHaveLength(0);
  });

  it('單一項目輸入時不被去重', async () => {
    const item = mockNewsItem({ id: 'id001', url: 'https://example.com/single' });
    const result = await deduplicateByTitle([item]);
    expect(result).toHaveLength(1);
  });

  it('重複時保留 publishedAt 較早的那筆', async () => {
    const earlyDate = new Date('2024-01-01T08:00:00Z');
    const lateDate = new Date('2024-01-01T20:00:00Z');

    const item1 = mockNewsItem({
      id: 'late-item',
      url: 'https://source-a.com/news',
      title: 'Major exchange hack results in $100M loss',
      publishedAt: lateDate,
    });
    const item2 = mockNewsItem({
      id: 'early-item',
      url: 'https://source-b.com/news',
      title: 'Major exchange hack results in $100M loss',
      publishedAt: earlyDate,
    });

    const result = await deduplicateByTitle([item1, item2]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('early-item');
  }, 30000);
});

describe('deduplicateByHistory()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('與歷史記錄中高度相似的新聞會被移除', async () => {
    vi.spyOn(historyModule, 'getHistoryTexts').mockReturnValue([
      {
        title: 'Morgan Stanley Bitcoin ETF Shatters Barriers with Historic NYSE Approval',
        contentSnippet: 'Morgan Stanley has received approval from NYSE to launch a spot Bitcoin ETF with the ticker MSBT, set to begin trading on April 2, 2025.',
      },
    ]);

    const items = [
      mockNewsItem({
        id: 'id001',
        url: 'https://source-a.com/ms-etf',
        title: 'Morgan Stanley Bitcoin ETF Poised for April 8 Launch, Sparking Major Institutional Shift',
        content: 'Morgan Stanley spot Bitcoin ETF is expected to begin trading on April 8 with the ticker BITA, marking a major institutional move into crypto markets.',
      }),
      mockNewsItem({
        id: 'id002',
        url: 'https://source-b.com/drift',
        title: 'DRIFT Hacked: 280M$ Loss and Price Collapse',
        content: 'Drift Protocol suffered a major exploit today with attackers draining approximately $280 million.',
      }),
    ];

    const result = await deduplicateByHistory(items);
    // Morgan Stanley ETF 應被移除（與歷史重複），Drift hack 應保留
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('id002');
  }, 30000);

  it('歷史記錄為空時保留所有項目', async () => {
    vi.spyOn(historyModule, 'getHistoryTexts').mockReturnValue([]);

    const items = [
      mockNewsItem({ id: 'id001', title: 'Some news' }),
    ];

    const result = await deduplicateByHistory(items);
    expect(result).toHaveLength(1);
  });
});

describe('deduplicate()（整合）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(historyModule, 'getHistoryTexts').mockReturnValue([]);
  });

  it('三階段去重正確回傳結果結構', async () => {
    const items: NewsItem[] = [
      mockNewsItem({ id: 'id001', url: 'https://example.com/dup', title: 'Dup A' }),
      mockNewsItem({ id: 'id002', url: 'https://example.com/dup', title: 'Dup B' }),
      mockNewsItem({ id: 'id003', url: 'https://example.com/unique', title: 'Unique Article' }),
    ];

    const result = await deduplicate(items);

    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('removedByUrl');
    expect(result).toHaveProperty('removedByTitle');
    expect(result).toHaveProperty('removedByHistory');
    expect(result.removedByUrl).toBe(1);
    expect(result.items.length).toBe(
      items.length - result.removedByUrl - result.removedByTitle - result.removedByHistory,
    );
  }, 30000);

  it('空陣列輸入時正確處理', async () => {
    const result = await deduplicate([]);

    expect(result.items).toHaveLength(0);
    expect(result.removedByUrl).toBe(0);
    expect(result.removedByTitle).toBe(0);
    expect(result.removedByHistory).toBe(0);
  });
});
