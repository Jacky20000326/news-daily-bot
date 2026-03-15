// 設定測試所需環境變數（必須在任何 src 模組 import 前設定）
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';

import { describe, it, expect } from 'vitest';
import { normalize } from '../../src/normalizer/index';
import type { TimeWindow } from '../../src/types';
import { mockRawItem } from '../helpers/mocks';

describe('normalize()', () => {
  // 建立時間窗：過去 2 小時到現在
  function buildWindow(): TimeWindow {
    const now = new Date();
    const from = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    return { from, to: now };
  }

  it('正常項目能正確標準化：id 為 16 字元', () => {
    const item = mockRawItem();
    const window = buildWindow();

    const results = normalize([item], window);

    expect(results).toHaveLength(1);
    expect(results[0].id).toHaveLength(16);
    // id 應為 hex 字元（0-9, a-f）
    expect(results[0].id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('正常項目能正確標準化：publishedAt 為 Date 物件', () => {
    const item = mockRawItem();
    const window = buildWindow();

    const results = normalize([item], window);

    expect(results).toHaveLength(1);
    expect(results[0].publishedAt).toBeInstanceOf(Date);
    expect(isNaN(results[0].publishedAt.getTime())).toBe(false);
  });

  it('正常項目能正確標準化：tags 轉換為小寫', () => {
    const item = mockRawItem({ tags: ['Bitcoin', 'BTC', 'PRICE'] });
    const window = buildWindow();

    const results = normalize([item], window);

    expect(results).toHaveLength(1);
    expect(results[0].tags).toEqual(['bitcoin', 'btc', 'price']);
  });

  it('publishedAt 無法解析時跳過該筆（不拋出錯誤）', () => {
    const item = mockRawItem({ publishedAt: 'invalid-date-string' });
    const window = buildWindow();

    // 不應拋出錯誤
    expect(() => normalize([item], window)).not.toThrow();

    const results = normalize([item], window);
    expect(results).toHaveLength(0);
  });

  it('publishedAt 為空字串時跳過該筆', () => {
    const item = mockRawItem({ publishedAt: '' });
    const window = buildWindow();

    const results = normalize([item], window);
    expect(results).toHaveLength(0);
  });

  it('title 為空時過濾掉', () => {
    const item = mockRawItem({ title: '' });
    const window = buildWindow();

    const results = normalize([item], window);
    expect(results).toHaveLength(0);
  });

  it('title 為僅空白時過濾掉', () => {
    const item = mockRawItem({ title: '   ' });
    const window = buildWindow();

    const results = normalize([item], window);
    expect(results).toHaveLength(0);
  });

  it('url 為空時過濾掉', () => {
    const item = mockRawItem({ url: '' });
    const window = buildWindow();

    const results = normalize([item], window);
    expect(results).toHaveLength(0);
  });

  it('url 為無效格式時過濾掉', () => {
    const item = mockRawItem({ url: 'not-a-valid-url' });
    const window = buildWindow();

    const results = normalize([item], window);
    expect(results).toHaveLength(0);
  });

  it('url 非 http/https 時過濾掉', () => {
    const item = mockRawItem({ url: 'ftp://example.com/news' });
    const window = buildWindow();

    const results = normalize([item], window);
    expect(results).toHaveLength(0);
  });

  it('不在時間窗內的項目被過濾掉（早於 from）', () => {
    const now = new Date();
    const from = new Date(now.getTime() - 60 * 60 * 1000); // 1 小時前
    const to = now;
    const window: TimeWindow = { from, to };

    // 發布時間為 2 小時前（早於 from）
    const oldDate = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const item = mockRawItem({ publishedAt: oldDate.toISOString() });

    const results = normalize([item], window);
    expect(results).toHaveLength(0);
  });

  it('不在時間窗內的項目被過濾掉（晚於 to）', () => {
    const now = new Date();
    const from = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const to = new Date(now.getTime() - 60 * 60 * 1000); // 1 小時前
    const window: TimeWindow = { from, to };

    // 發布時間為現在（晚於 to）
    const item = mockRawItem({ publishedAt: now.toISOString() });

    const results = normalize([item], window);
    expect(results).toHaveLength(0);
  });

  it('content 合併邏輯：有 content 時使用 content', () => {
    const item = mockRawItem({
      content: 'Full article content here.',
      summary: 'Short summary.',
    });
    const window = buildWindow();

    const results = normalize([item], window);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Full article content here.');
  });

  it('content 合併邏輯：無 content 時使用 title + " " + summary', () => {
    const item = mockRawItem({
      content: undefined,
      title: 'Test Title',
      summary: 'Test Summary',
    });
    const window = buildWindow();

    const results = normalize([item], window);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Test Title Test Summary');
  });

  it('content 合併邏輯：無 content 也無 summary 時只使用 title', () => {
    const item = mockRawItem({
      content: undefined,
      summary: undefined,
      title: 'Only Title',
    });
    const window = buildWindow();

    const results = normalize([item], window);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Only Title');
  });

  it('content 為空字串時使用 title + summary', () => {
    const item = mockRawItem({
      content: '   ',
      title: 'My Title',
      summary: 'My Summary',
    });
    const window = buildWindow();

    const results = normalize([item], window);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('My Title My Summary');
  });

  it('混合有效與無效項目時，只回傳有效項目', () => {
    const window = buildWindow();
    const validItem = mockRawItem({ url: 'https://example.com/valid' });
    const invalidItem = mockRawItem({ title: '', url: 'https://example.com/invalid' });

    const results = normalize([validItem, invalidItem], window);

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/valid');
  });

  it('tags 為 undefined 時回傳空陣列', () => {
    const item = mockRawItem({ tags: undefined });
    const window = buildWindow();

    const results = normalize([item], window);

    expect(results).toHaveLength(1);
    expect(results[0].tags).toEqual([]);
  });

  it('sourceType 對應來源的 source 欄位', () => {
    const item = mockRawItem({ source: 'rss' });
    const window = buildWindow();

    const results = normalize([item], window);

    expect(results).toHaveLength(1);
    expect(results[0].sourceType).toBe('rss');
  });
});
