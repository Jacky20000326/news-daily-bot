import nodemailer from 'nodemailer';
import type { DailyReport } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { buildPlainText } from '../reporter';

// ─── 主旨建構 ──────────────────────────────────────────────────────────────

/**
 * 建構 Email 主旨。
 * 格式：`[加密日報] YYYY-MM-DD 市場重點：{Top Story 標題前 30 字}`
 *
 * @param report - 每日報告資料
 * @returns 主旨字串
 */
function buildSubject(report: DailyReport): string {
  const topTitle =
    report.topStories.length > 0
      ? report.topStories[0].title.slice(0, 30)
      : '今日市場摘要';

  return `[加密日報] ${report.reportDate} 市場重點：${topTitle}`;
}

// ─── SMTP 發送 ────────────────────────────────────────────────────────────

/**
 * 建立 SMTP transporter。
 */
function createTransporter() {
  const { smtp } = config.email;
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: false,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });
}

// ─── 公開 API：發送每日報告 ───────────────────────────────────────────────

/**
 * 發送每日加密貨幣報告 Email（透過 SMTP）。
 *
 * @param report      - 每日報告資料
 * @param htmlContent - 由 generateReport() 產生的 HTML 字串
 */
export async function sendReport(report: DailyReport, htmlContent: string): Promise<void> {
  const { senderEmail, recipients } = config.email;

  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"加密日報" <${senderEmail}>`,
    to: recipients.join(', '),
    subject: buildSubject(report),
    html: htmlContent,
    text: buildPlainText(report),
  });

  logger.info('SMTP 發送成功', {
    recipients,
    reportDate: report.reportDate,
  });
}

// ─── 公開 API：發送警報 Email ─────────────────────────────────────────────

/**
 * 發送系統異常警報給管理員。
 *
 * 若 `config.email.alertEmail` 為空，則只記錄 error log，不嘗試寄送。
 *
 * @param error - 捕獲到的錯誤（unknown 型別）
 */
export async function sendAlertEmail(error: unknown): Promise<void> {
  const { alertEmail, senderEmail } = config.email;

  if (!alertEmail) {
    logger.error('系統警報（alertEmail 未設定，略過寄送）', {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack  = error instanceof Error ? (error.stack ?? '') : '';
  const now = new Date().toISOString();

  const subject = `[加密日報 警報] 系統異常 ${now}`;

  const htmlBody = `
    <p style="font-family:sans-serif;font-size:14px;color:#333;">
      <strong style="color:#e74c3c;">加密日報系統發生異常，請立即確認。</strong>
    </p>
    <table style="font-family:monospace;font-size:13px;border-collapse:collapse;width:100%;">
      <tr>
        <td style="padding:6px 12px;border:1px solid #ddd;background:#f8f9fa;width:120px;"><strong>時間</strong></td>
        <td style="padding:6px 12px;border:1px solid #ddd;">${now}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px;border:1px solid #ddd;background:#f8f9fa;"><strong>錯誤訊息</strong></td>
        <td style="padding:6px 12px;border:1px solid #ddd;color:#e74c3c;">${errorMessage}</td>
      </tr>
      ${errorStack ? `
      <tr>
        <td style="padding:6px 12px;border:1px solid #ddd;background:#f8f9fa;"><strong>Stack Trace</strong></td>
        <td style="padding:6px 12px;border:1px solid #ddd;white-space:pre-wrap;font-size:11px;">${errorStack}</td>
      </tr>` : ''}
    </table>
  `.trim();

  const textBody = `加密日報系統警報\n\n時間：${now}\n錯誤：${errorMessage}\n${errorStack ? `\nStack Trace:\n${errorStack}` : ''}`;

  try {
    const transporter = createTransporter();

    await transporter.sendMail({
      from: `"加密日報警報系統" <${senderEmail}>`,
      to: alertEmail,
      subject,
      html: htmlBody,
      text: textBody,
    });

    logger.info('警報 Email 已透過 SMTP 寄出', { alertEmail });
  } catch (smtpErr) {
    logger.error('警報 Email 寄送失敗', {
      originalError: errorMessage,
      smtpErr: String(smtpErr),
    });
  }
}
