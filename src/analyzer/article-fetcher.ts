import * as cheerio from 'cheerio';
import { httpClient } from '../utils/retry';
import { logger } from '../utils/logger';

// ─── 常數 ─────────────────────────────────────────────────────────────────────

/** 抓取文章的最大等待時間（毫秒） */
const FETCH_TIMEOUT_MS = 15000;

/** 抓取的 HTML 最大大小（位元組），超過截斷 */
const MAX_HTML_SIZE = 2_000_000;

/** 提取後文字的最大長度（字元） */
const MAX_TEXT_LENGTH = 8000;

/** 需要移除的 HTML 選擇器（非正文內容） */
const SELECTORS_TO_REMOVE = [
  'script', 'style', 'noscript', 'iframe', 'svg',
  'nav', 'header', 'footer',
  '.ad', '.ads', '.advertisement', '.sidebar',
  '.social-share', '.comments', '.related-posts',
  '.cookie-banner', '.popup', '.modal',
  '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
];

// ─── 主要函式 ─────────────────────────────────────────────────────────────────

/**
 * 抓取指定 URL 的文章內容，提取正文文字。
 * 失敗時回傳空字串（不中斷流程）。
 */
export async function fetchArticleContent(url: string): Promise<string> {
  try {
    const response = await httpClient.get<string>(url, {
      timeout: FETCH_TIMEOUT_MS,
      maxContentLength: MAX_HTML_SIZE,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CryptoDailyBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8',
      },
      responseType: 'text',
    });

    const html = typeof response.data === 'string' ? response.data : '';
    if (!html) {
      return '';
    }

    const text = extractTextFromHtml(html);

    logger.debug('文章內容抓取成功', {
      url,
      htmlLength: html.length,
      textLength: text.length,
    });

    return text;
  } catch (err) {
    logger.warn('文章內容抓取失敗', {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

// ─── HTML 文字提取 ────────────────────────────────────────────────────────────

/**
 * 從 HTML 中提取正文文字。
 * 優先嘗試 <article> 區塊，退回至 <body> 全文。
 */
function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html);

  // 移除非正文元素
  $(SELECTORS_TO_REMOVE.join(', ')).remove();

  // 優先取 article 或 main 標籤的內容
  let contentEl = $('article');
  if (contentEl.length === 0) {
    contentEl = $('main');
  }
  if (contentEl.length === 0) {
    contentEl = $('[role="main"]');
  }
  if (contentEl.length === 0) {
    contentEl = $('body');
  }

  // 提取文字，保留段落分隔
  const paragraphs: string[] = [];
  contentEl.find('p, h1, h2, h3, h4, h5, h6, li, blockquote').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 10) {
      paragraphs.push(text);
    }
  });

  // 若段落提取結果太少，退回取全部文字
  let result: string;
  if (paragraphs.length < 3) {
    result = contentEl.text().replace(/\s+/g, ' ').trim();
  } else {
    result = paragraphs.join('\n\n');
  }

  // 截斷至最大長度
  if (result.length > MAX_TEXT_LENGTH) {
    result = result.slice(0, MAX_TEXT_LENGTH) + '…';
  }

  return result;
}
