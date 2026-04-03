import { GoogleGenAI } from '@google/genai';
import { config } from '../config';
import type { DailyReport } from '../types';
import { logger } from '../utils/logger';

// ─── 設定 ────────────────────────────────────────────────────────────────────

const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const TTS_VOICE = 'Kore';
/** 每段最大字元數（保守估計，避免超過 8192 token 限制） */
const MAX_CHUNK_CHARS = 4000;

// ─── 文字準備 ────────────────────────────────────────────────────────────────

/**
 * 從 DailyReport 組合出語音導讀的段落列表
 * 每則新聞為獨立段落，方便分段合成
 */
export function buildNarrationSegments(report: DailyReport): string[] {
  const segments: string[] = [];

  // 開場 + 市場總覽
  let intro = `加密貨幣日報，${report.reportDate}。\n`;
  if (report.executiveSummary) {
    intro += `今日市場總覽。\n${report.executiveSummary}`;
  }
  segments.push(intro);

  // 逐則新聞，各為獨立段落
  report.topStories.forEach((story, i) => {
    const parts: string[] = [];
    parts.push(`第${i + 1}則。${story.title}。`);
    if (story.aiSummary) {
      parts.push(story.aiSummary);
    }
    if (story.deepAnalysis) {
      const cleaned = story.deepAnalysis.replace(/\*\*(.+?)\*\*/g, '$1');
      parts.push(cleaned);
    }
    segments.push(parts.join('\n'));
  });

  // 結語
  segments.push('以上為今日加密貨幣日報全部內容，感謝收聽。');

  return segments;
}

/**
 * 將段落合併為不超過 maxLen 字元的分段
 */
function mergeSegmentsIntoChunks(segments: string[], maxLen: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const seg of segments) {
    if ((current + '\n' + seg).length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += (current ? '\n' : '') + seg;
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

// ─── WAV 編碼 ─────────────────────────────────────────────────────────────────

function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
  header.writeUInt16LE(channels * bitsPerSample / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

// ─── 合成 ─────────────────────────────────────────────────────────────────────

/**
 * 呼叫 Gemini Flash TTS 合成單段語音，回傳 PCM Buffer
 */
async function synthesizeChunk(ai: GoogleGenAI, text: string): Promise<Buffer> {
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: TTS_VOICE },
        },
      },
    },
  });

  const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioData) {
    throw new Error('Gemini TTS 未回傳音訊資料');
  }

  return Buffer.from(audioData, 'base64');
}

/**
 * 合成完整文稿為 WAV
 * 自動將長文稿分段合成後串接
 */
export async function synthesize(text: string): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey: config.ai.apiKey });

  // 短文稿直接合成
  if (text.length <= MAX_CHUNK_CHARS) {
    logger.info('開始 Gemini TTS 語音合成（單段）', { chars: text.length });
    const pcm = await synthesizeChunk(ai, text);
    const wav = pcmToWav(pcm);
    logger.info('語音合成完成', {
      sizeKB: (wav.length / 1024).toFixed(1),
      durationSec: Math.round(pcm.length / (24000 * 2)),
    });
    return wav;
  }

  // 長文稿分段合成
  const sentences = text.split(/(?<=[。！？\n])/);
  const chunks = mergeSegmentsIntoChunks(sentences, MAX_CHUNK_CHARS);

  logger.info('開始 Gemini TTS 語音合成（分段）', {
    totalChars: text.length,
    chunks: chunks.length,
  });

  const pcmBuffers: Buffer[] = [];

  for (let i = 0; i < chunks.length; i++) {
    logger.debug('合成分段', { index: i + 1, chars: chunks[i].length });
    const pcm = await synthesizeChunk(ai, chunks[i]);
    pcmBuffers.push(pcm);
  }

  const combinedPcm = Buffer.concat(pcmBuffers);
  const wav = pcmToWav(combinedPcm);

  logger.info('語音合成完成', {
    sizeKB: (wav.length / 1024).toFixed(1),
    durationSec: Math.round(combinedPcm.length / (24000 * 2)),
  });

  return wav;
}

// ─── 主要匯出函式 ─────────────────────────────────────────────────────────────

/**
 * 為每日報告產生語音導讀 WAV
 */
export async function generateNarration(report: DailyReport): Promise<Buffer> {
  const segments = buildNarrationSegments(report);
  const fullText = segments.join('\n');
  return synthesize(fullText);
}
