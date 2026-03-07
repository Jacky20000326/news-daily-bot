import { ConfigValidationError } from '../types';

// 載入 dotenv（僅本地開發）
if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
}

const REQUIRED_VARS = [
  'ANTHROPIC_API_KEY',
  'NEWSAPI_KEY',
  'SENDGRID_API_KEY',
  'SENDER_EMAIL',
  'EMAIL_RECIPIENTS',
] as const;

// 啟動時驗證必要環境變數
for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    throw new ConfigValidationError(key);
  }
}

export const config = {
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.AI_MODEL ?? 'claude-sonnet-4-6',
    maxTokens: 4096,
    temperature: 0.3,
  },

  sources: {
    newsApiKey: process.env.NEWSAPI_KEY!,
    cryptoPanicToken: process.env.CRYPTOPANIC_TOKEN ?? '',
    coinGeckoApiKey: process.env.COINGECKO_API_KEY ?? '',
    enableRss: process.env.ENABLE_RSS !== 'false',
    enableCoinGecko: process.env.ENABLE_COINGECKO !== 'false',
  },

  email: {
    sendgridApiKey: process.env.SENDGRID_API_KEY!,
    senderEmail: process.env.SENDER_EMAIL!,
    recipients: process.env.EMAIL_RECIPIENTS!.split(',').map((e) => e.trim()),
    alertEmail: process.env.ALERT_EMAIL ?? '',
    smtp: {
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
  },

  scheduler: {
    timezone: process.env.TIMEZONE ?? 'Asia/Taipei',
    reportHour: parseInt(process.env.REPORT_HOUR ?? '9', 10),
  },

  app: {
    dryRun: process.env.DRY_RUN === 'true',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    nodeEnv: process.env.NODE_ENV ?? 'development',
  },
} as const;
