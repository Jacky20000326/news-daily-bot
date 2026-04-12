// 設定測試所需環境變數（必須在任何 src 模組 import 前設定）
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-pass';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

// 使用 vi.hoisted 確保變數在 vi.mock 工廠函式中可用
const { mockConnect, mockCreate, mockDelete, mockDispose, mockAddFromText, mockAudioCreate, mockArtifactsGet, mockDownload } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockCreate: vi.fn().mockResolvedValue({ projectId: 'test-notebook-id' }),
  mockDelete: vi.fn(),
  mockDispose: vi.fn(),
  mockAddFromText: vi.fn(),
  mockAudioCreate: vi.fn().mockResolvedValue({ audioId: 'test-audio-id', isReady: false }),
  mockArtifactsGet: vi.fn().mockResolvedValue({ state: 'READY' }),
  mockDownload: vi.fn(),
}));

// Mock notebooklm-kit
vi.mock('notebooklm-kit', () => ({
  NotebookLMClient: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    notebooks: {
      create: mockCreate,
      delete: mockDelete,
    },
    sources: {
      addFromText: mockAddFromText,
    },
    artifacts: {
      audio: { create: mockAudioCreate },
      get: mockArtifactsGet,
      download: mockDownload,
    },
    dispose: mockDispose,
  })),
  ArtifactState: { READY: 'READY', CREATING: 'CREATING' },
}));

// Mock config
vi.mock('../../src/config/index', () => ({
  config: {
    podcast: {
      enabled: true,
      notebookLmEmail: 'test@gmail.com',
      notebookLmPassword: 'test-password',
    },
    ai: { apiKey: 'test-key' },
  },
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import { generatePodcast } from '../../src/podcast';
import type { DailyReport } from '../../src/types';

const mockReport: DailyReport = {
  reportDate: '2026-04-04',
  generatedAt: new Date(),
  timeWindowFrom: new Date(),
  timeWindowTo: new Date(),
  totalCollected: 100,
  afterDedup: 50,
  topStories: [],
  executiveSummary: '今日市場總覽測試內容',
  sources: ['test-source'],
};

describe('podcast/generatePodcast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock download：建立臨時檔案並回傳路徑
    mockDownload.mockImplementation(async (_audioId: string, folder: string) => {
      const filePath = `${folder}/audio.mp3`;
      fs.writeFileSync(filePath, 'fake-mp3-data');
      return { filePath, fileName: 'audio.mp3' };
    });
  });

  it('應回傳音檔 Buffer', async () => {
    const result = await generatePodcast(mockReport);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('應依序執行完整流程：connect → create → addSource → audio → poll → download → delete → dispose', async () => {
    await generatePodcast(mockReport);

    expect(mockConnect).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith({ title: '加密貨幣日報 2026-04-04' });
    expect(mockAddFromText).toHaveBeenCalledOnce();
    expect(mockAudioCreate).toHaveBeenCalledOnce();
    expect(mockArtifactsGet).toHaveBeenCalled();
    expect(mockDownload).toHaveBeenCalledOnce();
    expect(mockDelete).toHaveBeenCalledWith('test-notebook-id');
    expect(mockDispose).toHaveBeenCalledOnce();
  });

  it('認證資訊未設定時應拋出錯誤', async () => {
    // 暫時覆蓋 config
    const configModule = await import('../../src/config/index');
    const originalEmail = configModule.config.podcast.notebookLmEmail;
    (configModule.config.podcast as any).notebookLmEmail = '';

    await expect(generatePodcast(mockReport)).rejects.toThrow('認證資訊未設定');

    (configModule.config.podcast as any).notebookLmEmail = originalEmail;
  });

  it('即使 notebook 刪除失敗也不影響回傳結果', async () => {
    mockDelete.mockRejectedValueOnce(new Error('delete failed'));

    const result = await generatePodcast(mockReport);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(mockDispose).toHaveBeenCalledOnce();
  });
});
