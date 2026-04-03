import fs from 'fs';
import path from 'path';
import { NewsItem } from '../types';
import { logger } from '../utils/logger';

// ─── 歷史記錄型別 ──────────────────────────────────────────────────────────────

interface HistoryEntry {
  title: string;
  contentSnippet: string;
  url: string;
  reportDate: string;
  addedAt: string;
}

interface HistoryData {
  entries: HistoryEntry[];
}

// ─── 設定 ────────────────────────────────────────────────────────────────────

const HISTORY_FILE = path.resolve(process.cwd(), 'data', 'dedup-history.json');
/** 歷史記錄保留天數 */
const RETENTION_DAYS = 7;

// ─── 讀寫函式 ────────────────────────────────────────────────────────────────

function ensureDataDir(): void {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadHistory(): HistoryEntry[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const data: HistoryData = JSON.parse(raw);
    return data.entries ?? [];
  } catch (err) {
    logger.warn('無法載入去重歷史，將使用空記錄', { err: String(err) });
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  ensureDataDir();
  const data: HistoryData = { entries };
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  logger.debug('去重歷史已儲存', { count: entries.length });
}

// ─── 清除過期記錄 ────────────────────────────────────────────────────────────

function pruneOldEntries(entries: HistoryEntry[]): HistoryEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString();

  return entries.filter((e) => e.addedAt >= cutoffStr);
}

// ─── 公開 API ─────────────────────────────────────────────────────────────────

/**
 * 取得歷史記錄中的標題與內容摘要（用於語義比較）
 */
export function getHistoryTexts(): { title: string; contentSnippet: string }[] {
  const entries = pruneOldEntries(loadHistory());
  return entries.map((e) => ({ title: e.title, contentSnippet: e.contentSnippet }));
}

/**
 * 將今日報告的新聞寫入歷史記錄
 */
export function appendToHistory(items: NewsItem[], reportDate: string): void {
  const existing = pruneOldEntries(loadHistory());

  const newEntries: HistoryEntry[] = items.map((item) => ({
    title: item.title,
    contentSnippet: item.content.slice(0, 300).trim(),
    url: item.url,
    reportDate,
    addedAt: new Date().toISOString(),
  }));

  saveHistory([...existing, ...newEntries]);
  logger.info('今日新聞已加入去重歷史', {
    newCount: newEntries.length,
    totalCount: existing.length + newEntries.length,
  });
}
