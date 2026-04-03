// 設定測試所需環境變數（必須在任何 src 模組 import 前設定）
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadHistory, getHistoryTexts, appendToHistory } from '../../src/deduplicator/history';
import { mockNewsItem } from '../helpers/mocks';

// Mock fs 模組以避免實際讀寫檔案
vi.mock('fs');
vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const HISTORY_FILE = path.resolve(process.cwd(), 'data', 'dedup-history.json');

describe('loadHistory()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('檔案不存在時回傳空陣列', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = loadHistory();
    expect(result).toEqual([]);
  });

  it('檔案存在時正確解析 JSON 並回傳 entries', () => {
    const mockData = {
      entries: [
        {
          title: 'Test News',
          contentSnippet: 'Test content',
          url: 'https://example.com/news',
          reportDate: '2026-04-01',
          addedAt: new Date().toISOString(),
        },
      ],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockData));

    const result = loadHistory();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test News');
  });

  it('JSON 格式錯誤時回傳空陣列（不拋出錯誤）', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

    const result = loadHistory();
    expect(result).toEqual([]);
  });

  it('entries 欄位不存在時回傳空陣列', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

    const result = loadHistory();
    expect(result).toEqual([]);
  });
});

describe('getHistoryTexts()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('回傳過濾過期記錄後的標題和內容摘要', () => {
    const recentDate = new Date().toISOString();
    const mockData = {
      entries: [
        {
          title: 'Recent News',
          contentSnippet: 'Recent content snippet',
          url: 'https://example.com/recent',
          reportDate: '2026-04-03',
          addedAt: recentDate,
        },
      ],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockData));

    const result = getHistoryTexts();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: 'Recent News',
      contentSnippet: 'Recent content snippet',
    });
  });

  it('超過 7 天的舊記錄會被過濾掉', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);

    const mockData = {
      entries: [
        {
          title: 'Old News',
          contentSnippet: 'Old content',
          url: 'https://example.com/old',
          reportDate: '2026-03-20',
          addedAt: oldDate.toISOString(),
        },
      ],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockData));

    const result = getHistoryTexts();
    expect(result).toHaveLength(0);
  });

  it('檔案不存在時回傳空陣列', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = getHistoryTexts();
    expect(result).toEqual([]);
  });
});

describe('appendToHistory()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('將新聞項目正確寫入歷史記錄', () => {
    // 模擬無既有歷史
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    const items = [
      mockNewsItem({
        title: 'New Article',
        content: 'Article content here for testing purposes.',
        url: 'https://example.com/new',
      }),
    ];

    appendToHistory(items, '2026-04-03');

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const writtenData = JSON.parse(
      vi.mocked(fs.writeFileSync).mock.calls[0][1] as string,
    );
    expect(writtenData.entries).toHaveLength(1);
    expect(writtenData.entries[0].title).toBe('New Article');
    expect(writtenData.entries[0].reportDate).toBe('2026-04-03');
  });

  it('合併既有歷史記錄與新項目', () => {
    const recentDate = new Date().toISOString();
    const existingData = {
      entries: [
        {
          title: 'Existing News',
          contentSnippet: 'Existing content',
          url: 'https://example.com/existing',
          reportDate: '2026-04-02',
          addedAt: recentDate,
        },
      ],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingData));
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    const items = [
      mockNewsItem({
        title: 'Brand New Article',
        content: 'Brand new content.',
        url: 'https://example.com/brand-new',
      }),
    ];

    appendToHistory(items, '2026-04-03');

    const writtenData = JSON.parse(
      vi.mocked(fs.writeFileSync).mock.calls[0][1] as string,
    );
    expect(writtenData.entries).toHaveLength(2);
    expect(writtenData.entries[0].title).toBe('Existing News');
    expect(writtenData.entries[1].title).toBe('Brand New Article');
  });

  it('寫入時自動清除超過 7 天的舊記錄', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);

    const existingData = {
      entries: [
        {
          title: 'Old News',
          contentSnippet: 'Old content',
          url: 'https://example.com/old',
          reportDate: '2026-03-20',
          addedAt: oldDate.toISOString(),
        },
      ],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingData));
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    const items = [
      mockNewsItem({
        title: 'Today News',
        content: 'Today content.',
        url: 'https://example.com/today',
      }),
    ];

    appendToHistory(items, '2026-04-03');

    const writtenData = JSON.parse(
      vi.mocked(fs.writeFileSync).mock.calls[0][1] as string,
    );
    // 舊記錄被清除，只剩新增的 1 筆
    expect(writtenData.entries).toHaveLength(1);
    expect(writtenData.entries[0].title).toBe('Today News');
  });

  it('content 超過 300 字時截斷', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    const longContent = 'A'.repeat(500);
    const items = [
      mockNewsItem({
        title: 'Long Content Article',
        content: longContent,
        url: 'https://example.com/long',
      }),
    ];

    appendToHistory(items, '2026-04-03');

    const writtenData = JSON.parse(
      vi.mocked(fs.writeFileSync).mock.calls[0][1] as string,
    );
    expect(writtenData.entries[0].contentSnippet).toHaveLength(300);
  });
});
