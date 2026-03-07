import cron from 'node-cron';
import { runDailyPipeline } from '../index';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─── Cron 表達式 ───────────────────────────────────────────────────────────────
// 每天 config.scheduler.reportHour 時整（預設 09:00 Asia/Taipei）
const cronExpression = `0 ${config.scheduler.reportHour} * * *`;

// ─── 排程器啟動 ────────────────────────────────────────────────────────────────

cron.schedule(
  cronExpression,
  async () => {
    logger.info('排程觸發：開始執行每日報告流程', {
      hour: config.scheduler.reportHour,
    });
    try {
      await runDailyPipeline();
    } catch (err) {
      logger.error('排程執行失敗', { err: String(err) });
    }
  },
  {
    timezone: config.scheduler.timezone,
  },
);

logger.info('排程器已啟動', {
  expression: cronExpression,
  timezone: config.scheduler.timezone,
});
