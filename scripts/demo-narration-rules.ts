import type { DailyReport, NewsCategory } from '../src/types';
import {
  DEFAULT_NARRATION_CONFIG,
  BRIEF_CONFIG,
  FULL_CONFIG,
  buildNarrationSegmentsWithRules,
  analyzeNewsPriority,
  estimateNarrationLength,
} from '../src/podcast/narration-rules';

/**
 * 演示 Podcast 優先級規則系統
 * 使用真實新聞數據展示各個配置的效果
 */
async function demo() {
  console.log('\n' + '='.repeat(90));
  console.log('🎙️  Podcast 優先級規則系統演示');
  console.log('='.repeat(90) + '\n');

  // ─── 構造真實數據 ─────────────────────────────────────────────────────

  const realNewsData = [
    {
      rank: 1,
      title: "FlamingChina hacker claims theft of 10+ petabytes from China's National Supercomputing Center",
      summary: "Hackers allegedly stole over 10PB of military data via compromised VPN, potentially the largest breach on record.",
      source: 'TechRadar',
    },
    {
      rank: 2,
      title: 'Quantum-Safe Bitcoin Implementation Developed Without Protocol Changes',
      summary: 'Researcher Avihu Levy released quantum-resistant Bitcoin solution using existing script capabilities.',
      source: 'cryptonews',
    },
    {
      rank: 3,
      title: 'New Stablecoin Rules Push Banks Into the Crypto Front Line',
      summary: 'US regulatory framework emerging for stablecoins will require stricter bank compliance.',
      source: 'pymnts.com',
    },
    {
      rank: 4,
      title: 'US Treasury Secretary Bessent Urges Congress to Pass Crypto Bill',
      summary: 'Treasury Secretary advocates for CLARITY Act passage to resolve regulatory ambiguity.',
      source: 'pymnts.com',
    },
    {
      rank: 5,
      title: 'US Government Transfers Seized Bitcoin to Coinbase; Stockpile Expands to $22B',
      summary: 'US government moved approximately 2.438 BTC to Coinbase, bringing total holdings to 328,000 BTC.',
      source: 'Cryptopolitan',
    },
    {
      rank: 6,
      title: 'Spot Bitcoin ETFs Surge With $358 Million Inflow, Reversing Two-Day Outflow',
      summary: 'US spot Bitcoin ETFs attracted substantial inflows on April 9, with iShares Bitcoin Trust leading.',
      source: 'Bitcoin World',
    },
    {
      rank: 7,
      title: 'BlackRock Withdraws $264 Million in Bitcoin and Ethereum from Coinbase',
      summary: 'BlackRock transferred 2,700 BTC and 30,000 ETH from Coinbase to private wallets.',
      source: 'Bitcoin World',
    },
    {
      rank: 8,
      title: 'XRP Gets Timeline for Regulatory Clarity in Japan; Bitcoin ETF Attracts $343M',
      summary: 'Japan establishes regulatory timeline for XRP; Bitcoin ETF experiences continued momentum.',
      source: 'U.Today',
    },
    {
      rank: 9,
      title: 'BlackRock Purchases $589 Million in Bitcoin and Ethereum This Week',
      summary: "BlackRock's spot ETFs accumulated over $589M in combined BTC/ETH purchases.",
      source: 'Finbold',
    },
    {
      rank: 10,
      title: 'Bitcoin and Ether ETFs Add Combined $443 Million in Strong Inflow Day',
      summary: 'BTC and ETH ETFs recorded combined $443M inflows April 9.',
      source: 'Bitcoin.com',
    },
  ];

  const categoryMap: Record<string, NewsCategory> = {
    'FlamingChina': 'security',
    'Quantum': 'technology',
    'Stablecoin': 'regulation',
    'Treasury': 'regulation',
    'Government': 'regulation',
    'ETF': 'market',
    'BlackRock': 'market',
    'XRP': 'regulation',
  };

  // 構造完整 DailyReport
  const report: DailyReport = {
    reportDate: '2026-04-11',
    generatedAt: new Date(),
    timeWindowFrom: new Date('2026-04-10T16:00:00Z'),
    timeWindowTo: new Date('2026-04-11T01:00:00Z'),
    totalCollected: 415,
    afterDedup: 45,
    topStories: realNewsData.map((item) => ({
      id: `news-${item.rank}`,
      url: `https://example.com/news/${item.rank}`,
      title: item.title,
      content: item.summary,
      publishedAt: new Date('2026-04-11T09:00:00Z'),
      sourceName: item.source,
      sourceType: 'newsapi' as const,
      tags: [],
      importanceScore: 10 - Math.floor(item.rank / 2),
      category: (Object.values(categoryMap)[item.rank % 5] || 'other') as NewsCategory,
      relatedTickers: ['BTC', 'ETH'],
      sentiment: item.rank <= 5 ? 'positive' : 'neutral',
      aiSummary: item.summary,
      deepAnalysis: `深度分析 - ${item.title}\n\n**關鍵信息：**\n${item.summary}\n\n**市場影響：**\n此事件對加密貨幣市場具有${item.rank <= 3 ? '重要' : '中等'}影響。`,
    })),
    executiveSummary: `加密貨幣市場今日呈現複雜格局。安全方面，中國超級計算中心據稱遭黑客入侵，涉及超過10PB數據。技術發展上，量子安全比特幣方案發布。監管端持續推進，美國財政部支持CLARITY法案，日本為XRP制定監管時間表。機構投資方面，貝萊德本週購買超5.89億美元的比特幣和以太坊，同時從Coinbase提取資金至自有錢包。現貨比特幣ETF錄得3.58億美元淨流入。整體而言，市場在地緣政治風險和監管進展推動下呈現震盪上行態勢。`,
    sources: ['TechRadar', 'cryptonews', 'pymnts.com', 'Bitcoin World', 'U.Today', 'Finbold'],
    mdReportUrl: 'https://jacky20000326.github.io/news-daily-bot/crypto-daily-2026-04-11.html',
  };

  // ─── 分析新聞優先級 ───────────────────────────────────────────────────

  console.log('📊 新聞優先級分析：\n');
  const priority = analyzeNewsPriority(report);

  console.log('配置規則: DEFAULT_NARRATION_CONFIG');
  console.log('├─ 主要新聞數量: ' + priority['主要新聞數量']);
  console.log('├─ 次要新聞數量: ' + priority['次要新聞數量']);
  console.log('└─ 預計播報時長: ' + priority['預計播報時長']);

  console.log('\n🔴 主要新聞（含深度分析）：');
  priority['主要新聞標題'].forEach((title) => {
    console.log('  ' + title);
  });

  console.log('\n🟡 次要新聞（簡要提及）：');
  priority['次要新聞標題'].forEach((title) => {
    console.log('  ' + title);
  });

  console.log('\n📝 市場總覽：');
  console.log('  ' + priority['市場總覽'].substring(0, 80) + '...\n');

  // ─── 展示三種配置的差異 ───────────────────────────────────────────────

  console.log('='.repeat(90));
  console.log('📋 三種配置對比\n');

  const configs = [
    { name: '完整配置 (FULL_CONFIG)', config: FULL_CONFIG, description: '所有新聞，詳細分析' },
    { name: '默認配置 (DEFAULT_CONFIG)', config: DEFAULT_NARRATION_CONFIG, description: '主要新聞深度分析 + 市場總覽（推薦）' },
    { name: '簡潔配置 (BRIEF_CONFIG)', config: BRIEF_CONFIG, description: '僅主要新聞，快速更新' },
  ];

  for (const { name, config: cfg, description } of configs) {
    console.log(`\n🎯 ${name}`);
    console.log(`   描述：${description}`);
    console.log(`   ├─ 主要新聞: ${cfg.primaryNewsCount} 則（含深度分析）`);
    console.log(`   ├─ 次要新聞: ${cfg.secondaryNewsCount} 則（${cfg.secondaryDetailLevel}）`);
    console.log(`   ├─ 市場總覽: ${cfg.includeExecutiveSummary ? '包含' : '不包含'}`);
    console.log(`   └─ 位置: ${cfg.executiveSummaryPosition}`);

    // 估算長度
    const lengths = estimateNarrationLength(report, cfg);
    console.log(
      `   📊 預計時長: ${lengths.estimatedDurationMinutes} 分鐘 (${lengths.totalCharacters} 字符)`
    );

    // 顯示分段結構
    const segments = buildNarrationSegmentsWithRules(report, cfg);
    console.log(`   📄 分段數: ${segments.length}`);
  }

  // ─── 詳細展示默認配置的內容 ──────────────────────────────────────────

  console.log('\n' + '='.repeat(90));
  console.log('📖 默認配置的詳細內容結構\n');

  const defaultSegments = buildNarrationSegmentsWithRules(report, DEFAULT_NARRATION_CONFIG);

  defaultSegments.forEach((segment, idx) => {
    const preview = segment.substring(0, 100).replace(/\n/g, ' ');
    console.log(`[段落 ${idx + 1}] ${preview}${segment.length > 100 ? '...' : ''}`);
  });

  // ─── 生成完整敘述文本 ────────────────────────────────────────────────

  console.log('\n' + '='.repeat(90));
  console.log('✨ 完整 Podcast 敘述文本（默認配置）\n');

  const fullNarration = defaultSegments.join('\n\n');
  console.log(fullNarration);

  // ─── 統計 ──────────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(90));
  console.log('📊 內容統計\n');

  const stats = estimateNarrationLength(report, DEFAULT_NARRATION_CONFIG);
  console.log(`總字符數:      ${stats.totalCharacters}`);
  console.log(`總詞數:        ${stats.totalWords}`);
  console.log(`預計播報時長:  ${stats.estimatedDurationMinutes} 分鐘（${stats.estimatedDurationSeconds} 秒）`);
  console.log(`每分鐘字數:    ${Math.round(stats.totalCharacters / parseFloat(stats.estimatedDurationMinutes))}`);

  // ─── 建議 ──────────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(90));
  console.log('💡 使用建議\n');

  console.log('✅ 推薦：DEFAULT_NARRATION_CONFIG');
  console.log('   • 平衡重點和全面性');
  console.log('   • 重點新聞含深度分析');
  console.log('   • 次要新聞簡要提及');
  console.log('   • 播報時長 3-4 分鐘\n');

  console.log('⚡ 快速更新：BRIEF_CONFIG');
  console.log('   • 只強調前 6 則主要新聞');
  console.log('   • 適合緊急更新');
  console.log('   • 播報時長 1-2 分鐘\n');

  console.log('📚 完整分析：FULL_CONFIG');
  console.log('   • 包含所有 10 則新聞');
  console.log('   • 次要新聞也有摘要');
  console.log('   • 播報時長 5-6 分鐘\n');

  console.log('='.repeat(90) + '\n');
}

// 執行演示
demo().catch(console.error);
