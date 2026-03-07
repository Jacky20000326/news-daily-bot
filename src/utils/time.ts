import type { TimeWindow } from '../types';

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

/**
 * 取得今日報告的時間窗
 * from = 昨日 00:00:00 Asia/Taipei
 * to   = 今日 09:00:00 Asia/Taipei
 */
export function getReportTimeWindow(): TimeWindow {
  const now = new Date();

  // 取得今日台北時間的 00:00:00
  const taipeiNow = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  const taipeiToday = new Date(
    Date.UTC(
      taipeiNow.getUTCFullYear(),
      taipeiNow.getUTCMonth(),
      taipeiNow.getUTCDate(),
      0, 0, 0, 0
    )
  );

  // today 09:00 Taipei = today 01:00 UTC
  const toUtc = new Date(taipeiToday.getTime() + 9 * 60 * 60 * 1000 - TAIPEI_OFFSET_MS);

  // yesterday 00:00 Taipei = yesterday 16:00 UTC
  const fromUtc = new Date(toUtc.getTime() - 33 * 60 * 60 * 1000);

  return { from: fromUtc, to: toUtc };
}

/**
 * 取得今日報告日期字串（Asia/Taipei）
 */
export function getReportDateString(): string {
  const now = new Date();
  const taipeiNow = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  const y = taipeiNow.getUTCFullYear();
  const m = String(taipeiNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(taipeiNow.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 格式化時間為台北時間顯示字串
 */
export function formatTaipeiTime(date: Date): string {
  const taipeiDate = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  const h = String(taipeiDate.getUTCHours()).padStart(2, '0');
  const min = String(taipeiDate.getUTCMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

/**
 * 檢查日期是否在時間窗內
 */
export function isWithinTimeWindow(date: Date, window: TimeWindow): boolean {
  return date >= window.from && date <= window.to;
}
