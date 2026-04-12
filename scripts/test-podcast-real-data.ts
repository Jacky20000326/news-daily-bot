import { generatePodcast } from '../src/podcast';
import type { DailyReport, AnalyzedNewsItem, NewsCategory } from '../src/types';
import { logger } from '../src/utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 使用真實數據測試 NotebookLM Podcast 功能
 * 數據來源：https://jacky20000326.github.io/news-daily-bot/crypto-daily-2026-04-11.html
 */
async function testPodcastWithRealData() {
  console.log('\n' + '='.repeat(80));
  console.log('🎙️  NotebookLM Podcast 真實數據測試');
  console.log('='.repeat(80) + '\n');

  // ─── 使用真實新聞數據 ───────────────────────────────────────────────────

  const categoryMap: Record<string, NewsCategory> = {
    'Security Incident': 'security',
    'Technical Development': 'technology',
    'Regulatory Policy': 'regulation',
    'Market Movement': 'market',
    'Exchange Dynamics': 'exchange',
  };

  const realNewsData = [
    {
      rank: 1,
      title: "FlamingChina hacker claims theft of 10+ petabytes from China's National Supercomputing Center",
      category: 'Security Incident',
      importance_score: 9,
      sentiment: 'Negative',
      key_symbol: null,
      summary: "Hackers allegedly stole over 10PB of military data via compromised VPN, potentially the largest breach on record.",
      source: 'TechRadar',
    },
    {
      rank: 2,
      title: 'Quantum-Safe Bitcoin Implementation Developed Without Protocol Changes',
      category: 'Technical Development',
      importance_score: 9,
      sentiment: 'Positive',
      key_symbol: 'BTC',
      summary: 'Researcher Avihu Levy released quantum-resistant Bitcoin solution using existing script capabilities, bypassing protocol upgrade complexities.',
      source: 'cryptonews',
    },
    {
      rank: 3,
      title: 'New Stablecoin Rules Push Banks Into the Crypto Front Line',
      category: 'Regulatory Policy',
      importance_score: 8,
      sentiment: 'Neutral',
      key_symbol: null,
      summary: 'US regulatory framework emerging for stablecoins will require stricter bank compliance and deeper financial institution participation.',
      source: 'pymnts.com',
    },
    {
      rank: 4,
      title: 'US Treasury Secretary Bessent Urges Congress to Pass Crypto Bill',
      category: 'Regulatory Policy',
      importance_score: 8,
      sentiment: 'Positive',
      key_symbol: null,
      summary: 'Treasury Secretary advocates for CLARITY Act passage to resolve regulatory ambiguity and preserve US crypto leadership.',
      source: 'pymnts.com',
    },
    {
      rank: 5,
      title: 'US Government Transfers Seized Bitcoin to Coinbase; Stockpile Expands to $22B',
      category: 'Regulatory Policy',
      importance_score: 8,
      sentiment: 'Neutral',
      key_symbol: 'BTC',
      summary: 'US government moved approximately 2.438 BTC to Coinbase, bringing total holdings to 328,000 BTC worth over $22 billion.',
      source: 'Cryptopolitan',
    },
    {
      rank: 6,
      title: 'Spot Bitcoin ETFs Surge With $358 Million Inflow, Reversing Two-Day Outflow',
      category: 'Market Movement',
      importance_score: 8,
      sentiment: 'Positive',
      key_symbol: 'BTC',
      summary: 'US spot Bitcoin ETFs attracted substantial inflows on April 9, with iShares Bitcoin Trust (IBIT) leading at $269 million.',
      source: 'Bitcoin World',
    },
    {
      rank: 7,
      title: 'BlackRock Withdraws $264 Million in Bitcoin and Ethereum from Coinbase',
      category: 'Exchange Dynamics',
      importance_score: 8,
      sentiment: 'Neutral',
      key_symbol: ['BTC', 'ETH'],
      summary: 'BlackRock transferred 2,700 BTC and 30,000 ETH from Coinbase to private wallets, signaling long-term holding strategy.',
      source: 'Bitcoin World',
    },
    {
      rank: 8,
      title: 'XRP Gets Timeline for Regulatory Clarity in Japan; Bitcoin ETF Attracts $343M',
      category: 'Regulatory Policy',
      importance_score: 8,
      sentiment: 'Positive',
      key_symbol: ['XRP', 'BTC'],
      summary: 'Japan establishes regulatory timeline for XRP; Bitcoin ETF experiences continued institutional investment momentum.',
      source: 'U.Today',
    },
    {
      rank: 9,
      title: 'BlackRock Purchases $589 Million in Bitcoin and Ethereum This Week',
      category: 'Market Movement',
      importance_score: 8,
      sentiment: 'Positive',
      key_symbol: ['BTC', 'ETH'],
      summary: "BlackRock's spot ETFs accumulated over $589M in combined BTC/ETH purchases over four trading days.",
      source: 'Finbold',
    },
    {
      rank: 10,
      title: 'Bitcoin and Ether ETFs Add Combined $443 Million in Strong Inflow Day',
      category: 'Market Movement',
      importance_score: 8,
      sentiment: 'Positive',
      key_symbol: ['BTC', 'ETH', 'XRP', 'SOL'],
      summary: 'BTC and ETH ETFs recorded combined $443M inflows April 9, with Bitcoin leading at $358M.',
      source: 'Bitcoin.com',
    },
  ];

  // ─── 轉換為 AnalyzedNewsItem 格式 ───────────────────────────────────────

  const testStories: AnalyzedNewsItem[] = realNewsData.map((item) => ({
    id: `real-news-${item.rank}`,
    url: `https://jacky20000326.github.io/news-daily-bot/crypto-daily-2026-04-11.html#story-${item.rank}`,
    title: item.title,
    content: item.summary,
    publishedAt: new Date('2026-04-11T09:00:00Z'),
    sourceName: item.source,
    sourceType: 'newsapi' as const,
    tags: item.key_symbol ? (Array.isArray(item.key_symbol) ? item.key_symbol : [item.key_symbol]) : [],
    importanceScore: item.importance_score,
    category: (categoryMap[item.category] || 'other') as NewsCategory,
    relatedTickers: item.key_symbol ? (Array.isArray(item.key_symbol) ? item.key_symbol : [item.key_symbol]) : [],
    sentiment: (item.sentiment.toLowerCase() as 'positive' | 'negative' | 'neutral'),
    aiSummary: item.summary,
    deepAnalysis: `深度分析 - ${item.title}\n\n**新聞背景：**\n${item.summary}\n\n**市場影響：**\n此事件對加密貨幣市場的${item.sentiment === 'Positive' ? '利好' : item.sentiment === 'Negative' ? '利空' : '中性'}影響。\n\n**後續關注點：**\n投資者應密切跟進相關發展，評估對投資組合的影響。`,
  }));

  // ─── 執行摘要（從多個新聞綜合） ───────────────────────────────────────

  const executiveSummary = `加密貨幣市場今日呈現複雜格局。安全事件方面，中國國家超級計算中心據稱遭到黑客入侵，涉及超過10PB的數據竊取，引發全球網路安全警報。技術發展上，研究人員發布了量子安全比特幣解決方案，無需修改協議即可實現量子抗性。

監管政策端持續推進，美國財政部長支持通過CLARITY法案以明確加密貨幣監管框架，日本也為XRP制定了監管時間表。政府資產管理方面，美國政府將扣押的比特幣轉移至Coinbase，總計持有32.8萬枚BTC，價值超220億美元。

機構投資方面，貝萊德本週購買了超過5.89億美元的比特幣和以太坊，同時從Coinbase提取2,700枚BTC和30,000枚ETH至自有錢包，表明機構投資者信心堅定。現貨比特幣ETF錄得3.58億美元淨流入，扭轉了之前兩日的資金流出。整體而言，市場在地緣政治風險和監管進展的推動下呈現震盪上行態勢。`;

  // ─── 構造完整的 DailyReport ───────────────────────────────────────────

  const realReport: DailyReport = {
    reportDate: '2026-04-11',
    generatedAt: new Date(),
    timeWindowFrom: new Date('2026-04-10T16:00:00Z'),  // 2026-04-11 00:00 Taipei
    timeWindowTo: new Date('2026-04-11T01:00:00Z'),    // 2026-04-11 09:00 Taipei
    totalCollected: 415,
    afterDedup: 45,
    topStories: testStories,
    executiveSummary,
    sources: ['TechRadar', 'cryptonews', 'pymnts.com', 'Cryptopolitan', 'Bitcoin World', 'U.Today', 'Finbold', 'Bitcoin.com'],
    mdReportUrl: 'https://jacky20000326.github.io/news-daily-bot/crypto-daily-2026-04-11.html',
  };

  // ─── 測試開始 ───────────────────────────────────────────────────────────

  console.log('📋 報告信息：');
  console.log(`  日期: ${realReport.reportDate}`);
  console.log(`  收集新聞: ${realReport.totalCollected} 篇`);
  console.log(`  去重後: ${realReport.afterDedup} 篇`);
  console.log(`  精選新聞: ${realReport.topStories.length} 篇`);
  console.log(`  執行摘要: ${realReport.executiveSummary.length} 字元`);
  console.log(`  新聞來源: ${realReport.sources.join(', ')}`);
  console.log('');

  console.log('📰 精選新聞列表：');
  realReport.topStories.forEach((story) => {
    console.log(`  ${story.importanceScore}/10 | ${story.title.substring(0, 60)}...`);
  });
  console.log('');

  const startTime = Date.now();

  try {
    console.log('⏳ 正在生成 Podcast（預計 3-5 分鐘）...\n');

    // 調用 generatePodcast
    const audioBuffer = await generatePodcast(realReport);

    const duration = Date.now() - startTime;
    const durationMin = (duration / 1000 / 60).toFixed(1);

    // ─── 結果分析 ───────────────────────────────────────────────────────

    console.log('\n✅ Podcast 生成成功！\n');
    console.log('📊 結果信息：');
    console.log(`  音檔大小: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  總耗時: ${durationMin} 分鐘`);
    console.log(`  音檔類型: MP3 (NotebookLM Audio Overview)`);
    console.log('');

    // ─── 儲存音檔 ───────────────────────────────────────────────────────

    const audioDir = path.join(process.cwd(), 'generated-podcasts');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    const audioFilePath = path.join(audioDir, `crypto-daily-2026-04-11-${Date.now()}.mp3`);
    fs.writeFileSync(audioFilePath, audioBuffer);

    console.log('💾 音檔已儲存：');
    console.log(`  路徑: ${audioFilePath}`);
    console.log(`  大小: ${(fs.statSync(audioFilePath).size / 1024 / 1024).toFixed(2)} MB`);
    console.log('');

    // ─── 驗證 Buffer ───────────────────────────────────────────────────

    console.log('🔍 音檔驗證：');
    if (audioBuffer.length > 0) {
      console.log(`  ✓ 音檔數據正確 (${audioBuffer.length} 字節)`);
    }

    const firstThreeBytes = Buffer.alloc(3);
    audioBuffer.copy(firstThreeBytes, 0, 0, 3);
    const mp3Header = firstThreeBytes.toString('hex');
    if (mp3Header === '494433') {
      console.log(`  ✓ MP3 ID3 標籤驗證通過 (0x${mp3Header})`);
    } else {
      console.log(`  ℹ 音檔開頭: 0x${mp3Header}`);
    }
    console.log('');

    console.log('💡 下一步：');
    console.log('  1. ✅ 可直接推送至 GitHub Pages: audio/2026-04-11.mp3');
    console.log('  2. ✅ 可在 Email 中包含播放連結');
    console.log('  3. ✅ 可用任何 MP3 播放器試聽品質');
    console.log('');

    console.log('🎯 NotebookLM Podcast 特色：');
    console.log('  • 雙主持人對話格式 - 自然生動');
    console.log('  • 繁體中文播報 - 本地化支援');
    console.log('  • 智能摘要合成 - 從10則新聞自動提煉重點');
    console.log('  • 流暢語音品質 - 專業級錄音');
    console.log('');

    console.log('='.repeat(80));
    console.log('✨ 使用真實新聞數據的 Podcast 生成成功！');
    console.log('='.repeat(80) + '\n');

    return {
      success: true as const,
      audioSize: audioBuffer.length,
      duration,
      filePath: audioFilePath,
    };
  } catch (err) {
    const duration = Date.now() - startTime;

    console.log('\n❌ Podcast 生成失敗\n');
    console.log('⚠️  錯誤信息：');
    console.log(`  ${err instanceof Error ? err.message : String(err)}`);
    console.log('');

    if (err instanceof Error && err.message.includes('超時')) {
      console.log('⏱️  可能原因：');
      console.log('  1. NotebookLM 服務器繁忙');
      console.log('  2. buildLabel 配置過期（日期: 2026-04-02）');
      console.log('  3. 網路連線延遲');
      console.log('');
      console.log('🔧 解決方案：');
      console.log('  • 執行：pnpm ts-node scripts/auto-login.ts （更新配置）');
      console.log('  • 編輯 src/podcast/index.ts 增加 GENERATION_TIMEOUT_MS');
      console.log('  • 稍後重試');
    }

    console.log(`\n⏱️  耗時: ${(duration / 1000).toFixed(1)} 秒\n`);

    console.log('='.repeat(80));
    console.log('❌ 測試失敗');
    console.log('='.repeat(80) + '\n');

    return {
      success: false as const,
      error: err instanceof Error ? err.message : String(err),
      duration,
    };
  }
}

// 執行測試
testPodcastWithRealData().then((result: any) => {
  if (result.success) {
    logger.info('✅ Podcast 測試成功', {
      audioSize: (result.audioSize / 1024 / 1024).toFixed(2) + ' MB',
      duration: (result.duration / 1000 / 60).toFixed(1) + ' 分鐘',
      filePath: result.filePath,
    });
  } else {
    logger.error('❌ Podcast 測試失敗', {
      error: result.error,
      duration: (result.duration / 1000).toFixed(1) + ' 秒',
    });
    process.exit(1);
  }
});
