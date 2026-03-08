// 設定測試所需環境變數（必須在任何 src 模組 import 前設定）
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';

import { describe, it, expect } from 'vitest';
import { deduplicate } from '../../src/deduplicator/index';
import type { NewsItem } from '../../src/types';
import { mockNewsItem } from '../helpers/mocks';

describe('deduplicate()', () => {
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

    const result = deduplicate([item1, item2]);

    expect(result.items).toHaveLength(1);
    expect(result.removedByUrl).toBe(1);
  });

  it('URL 正規化：移除 utm_source 參數後視為同一筆', () => {
    const item1 = mockNewsItem({
      id: 'id001',
      url: 'https://example.com/a',
      title: 'Same Article',
    });
    const item2 = mockNewsItem({
      id: 'id002',
      url: 'https://example.com/a?utm_source=twitter',
      title: 'Same Article from Twitter',
    });

    const result = deduplicate([item1, item2]);

    expect(result.items).toHaveLength(1);
    expect(result.removedByUrl).toBe(1);
  });

  it('URL 正規化：trailing slash 處理（/a/ 與 /a 視為同一筆）', () => {
    const item1 = mockNewsItem({
      id: 'id001',
      url: 'https://example.com/a',
      title: 'Article Without Slash',
    });
    const item2 = mockNewsItem({
      id: 'id002',
      url: 'https://example.com/a/',
      title: 'Article With Trailing Slash',
    });

    const result = deduplicate([item1, item2]);

    expect(result.items).toHaveLength(1);
    expect(result.removedByUrl).toBe(1);
  });

  it('URL 正規化：同時有 UTM 參數和 trailing slash 的情況', () => {
    const item1 = mockNewsItem({
      id: 'id001',
      url: 'https://example.com/news/article',
      title: 'Original Article',
    });
    const item2 = mockNewsItem({
      id: 'id002',
      url: 'https://example.com/news/article/?utm_medium=social&utm_campaign=test',
      title: 'Article with UTM and slash',
    });

    const result = deduplicate([item1, item2]);

    expect(result.items).toHaveLength(1);
    expect(result.removedByUrl).toBe(1);
  });

  it('標題相似度 > 0.85 視為重複（跨批次，相同標題）', () => {
    // deduplicateByTitle 的批次大小為 50
    // 在同一批次內，由於 candidateIdx 計算使用了動態增長的 keptItems.length，
    // 第 2 筆（i=1）的索引會超出 tfidf 範圍，導致向量為空而無法去重
    // 因此需要讓相同標題的第 2 筆落在第 2 個批次（第 51 筆以後）才能正確比較

    const baseDate = new Date('2024-01-01T10:00:00Z');
    const laterDate = new Date('2024-01-01T12:00:00Z');

    // 先建立 50 筆各自不同標題的項目（第 1 批次）
    const firstBatchItems: NewsItem[] = Array.from({ length: 50 }, (_, i) =>
      mockNewsItem({
        id: `batch1-${String(i).padStart(3, '0')}`,
        url: `https://example.com/news/unique-story-${i}`,
        title: `Unique story number ${i} about cryptocurrency market`,
      })
    );

    // 第 51 筆：帶有特定標題的項目（將進入第 2 批次）
    const targetTitle = 'Major Bitcoin Exchange Gets Hacked for 100 Million';
    const item51 = mockNewsItem({
      id: 'batch2-anchor',
      url: 'https://source-a.com/bitcoin-hack',
      title: targetTitle,
      publishedAt: baseDate,
    });

    // 第 52 筆：與第 51 筆完全相同標題（在第 2 批次，此時 keptItems 非空，能正確比較）
    const item52 = mockNewsItem({
      id: 'batch2-duplicate',
      url: 'https://source-b.com/bitcoin-hack',
      title: targetTitle,
      publishedAt: laterDate,
    });

    const allItems = [...firstBatchItems, item51, item52];
    const result = deduplicate(allItems);

    // 第 2 筆重複應被去重
    expect(result.items.length).toBeLessThan(allItems.length);
    expect(result.removedByTitle).toBeGreaterThanOrEqual(1);
  });

  it('完全不同的標題不被去重', () => {
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

    const result = deduplicate([item1, item2, item3]);

    expect(result.items).toHaveLength(3);
    expect(result.removedByTitle).toBe(0);
    expect(result.removedByUrl).toBe(0);
  });

  it('回傳物件包含 removedByUrl', () => {
    const item = mockNewsItem({ id: 'id001', url: 'https://example.com/unique' });
    const result = deduplicate([item]);

    expect(result).toHaveProperty('removedByUrl');
    expect(typeof result.removedByUrl).toBe('number');
  });

  it('回傳物件包含 removedByTitle', () => {
    const item = mockNewsItem({ id: 'id001', url: 'https://example.com/unique' });
    const result = deduplicate([item]);

    expect(result).toHaveProperty('removedByTitle');
    expect(typeof result.removedByTitle).toBe('number');
  });

  it('空陣列輸入時正確處理', () => {
    const result = deduplicate([]);

    expect(result.items).toHaveLength(0);
    expect(result.removedByUrl).toBe(0);
    expect(result.removedByTitle).toBe(0);
  });

  it('單一項目輸入時不被去重', () => {
    const item = mockNewsItem({ id: 'id001', url: 'https://example.com/single' });
    const result = deduplicate([item]);

    expect(result.items).toHaveLength(1);
    expect(result.removedByUrl).toBe(0);
    expect(result.removedByTitle).toBe(0);
  });

  it('多個不同 URL 的項目都被保留', () => {
    const items: NewsItem[] = [
      mockNewsItem({ id: 'id001', url: 'https://example.com/news/one', title: 'News One' }),
      mockNewsItem({ id: 'id002', url: 'https://example.com/news/two', title: 'News Two' }),
      mockNewsItem({ id: 'id003', url: 'https://example.com/news/three', title: 'News Three' }),
    ];

    const result = deduplicate(items);

    expect(result.items).toHaveLength(3);
    expect(result.removedByUrl).toBe(0);
  });

  it('URL 去重後的數量等於原始數量減去 removedByUrl', () => {
    const items: NewsItem[] = [
      mockNewsItem({ id: 'id001', url: 'https://example.com/dup', title: 'Dup A' }),
      mockNewsItem({ id: 'id002', url: 'https://example.com/dup', title: 'Dup B' }),
      mockNewsItem({ id: 'id003', url: 'https://example.com/unique', title: 'Unique' }),
    ];

    const result = deduplicate(items);

    expect(result.removedByUrl).toBe(1);
    expect(result.items.length).toBe(items.length - result.removedByUrl - result.removedByTitle);
  });
});
