import nodemailer from 'nodemailer';
import type { DailyReport } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─── 主旨建構 ──────────────────────────────────────────────────────────────

function buildSubject(report: DailyReport): string {
  const topTitle =
    report.topStories.length > 0
      ? report.topStories[0].title.slice(0, 30)
      : '今日市場摘要';

  return `[加密日報] ${report.reportDate} 市場重點：${topTitle}`;
}

// ─── SMTP 發送 ────────────────────────────────────────────────────────────

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

// ─── 建構通知信 HTML ─────────────────────────────────────────────────────

function buildNotificationHtml(report: DailyReport): string {
  const { topStories, reportDate, sources, mdReportUrl } = report;

  const storiesHtml = topStories
    .map(
      (item, i) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding-right:12px;vertical-align:top;width:28px;">
                <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background-color:#f39c12;color:#fff;font-size:12px;font-weight:700;">${i + 1}</span>
              </td>
              <td>
                <a href="${item.url}" target="_blank" rel="noopener noreferrer"
                   style="font-size:14px;font-weight:600;color:#1a1a2e;text-decoration:none;line-height:1.5;display:block;">
                  ${item.title}
                </a>
                <span style="font-size:11px;color:#95a5a6;">${item.sourceName}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    )
    .join('');

  const reportLink = mdReportUrl
    ? `<tr>
        <td align="center" style="padding:28px 32px;">
          <a href="${mdReportUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:14px 36px;background-color:#f39c12;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.5px;">
            閱讀完整報告 &rarr;
          </a>
          <p style="margin:12px 0 0 0;font-size:12px;color:#95a5a6;">點擊上方按鈕查看 AI 深度分析與重點整理</p>
        </td>
      </tr>`
    : '';

  const sourcesText = sources.join('、');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>加密貨幣日報 ${reportDate}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1a1a2e;padding:32px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7f8fa6;font-weight:600;">DAILY CRYPTO INTELLIGENCE</p>
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">加密貨幣日報</h1>
              <p style="margin:8px 0 0 0;font-size:16px;color:#a8d8ea;">${reportDate}</p>
            </td>
          </tr>

          <!-- 今日頭條 -->
          <tr>
            <td style="padding:24px 32px 8px 32px;">
              <h2 style="margin:0 0 4px 0;font-size:17px;font-weight:700;color:#1a1a2e;">今日頭條</h2>
              <p style="margin:0 0 12px 0;font-size:12px;color:#95a5a6;">以下為今日最重要的 ${topStories.length} 則新聞</p>
              <hr style="margin:0;border:none;border-top:1px solid #ecf0f1;" />
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${storiesHtml}
              </table>
            </td>
          </tr>

          <!-- 閱讀完整報告按鈕 -->
          ${reportLink}

          <!-- 資料來源 -->
          <tr>
            <td style="padding:16px 32px 24px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="background-color:#f8f9fa;border-radius:8px;padding:14px 18px;">
                    <p style="margin:0 0 6px 0;font-size:12px;font-weight:700;color:#7f8c8d;">資料來源</p>
                    <p style="margin:0;font-size:12px;color:#95a5a6;line-height:1.6;">${sourcesText}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#1a1a2e;padding:20px 32px;text-align:center;border-radius:0 0 8px 8px;">
              <p style="margin:0 0 6px 0;font-size:11px;color:#7f8fa6;line-height:1.6;">本報告由 AI 自動生成，僅供參考，不構成投資建議。</p>
              <p style="margin:0;font-size:10px;color:#3d4b5c;">&copy; ${reportDate} Crypto Daily News | Powered by AI</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── 建構純文字版 ────────────────────────────────────────────────────────

function buildNotificationText(report: DailyReport): string {
  const lines: string[] = [];

  lines.push(`加密貨幣日報 ${report.reportDate}`);
  lines.push('='.repeat(40));
  lines.push('');

  lines.push('【今日頭條】');
  report.topStories.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.title}`);
    lines.push(`   來源：${item.sourceName}`);
    lines.push(`   連結：${item.url}`);
    lines.push('');
  });

  if (report.mdReportUrl) {
    lines.push('【完整報告】');
    lines.push(report.mdReportUrl);
    lines.push('');
  }

  lines.push(`資料來源：${report.sources.join('、')}`);
  lines.push('');
  lines.push('本報告由 AI 自動生成，僅供參考，不構成投資建議。');

  return lines.join('\n');
}

// ─── 公開 API：發送每日報告 ───────────────────────────────────────────────

/**
 * 發送每日通知 Email：包含頭條新聞列表 + 完整報告連結。
 */
export async function sendReport(report: DailyReport): Promise<void> {
  const { senderEmail, recipients } = config.email;

  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"加密日報" <${senderEmail}>`,
    to: recipients.join(', '),
    subject: buildSubject(report),
    html: buildNotificationHtml(report),
    text: buildNotificationText(report),
  });

  logger.info('SMTP 發送成功', {
    recipients,
    reportDate: report.reportDate,
  });
}

// ─── 公開 API：發送警報 Email ─────────────────────────────────────────────

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
