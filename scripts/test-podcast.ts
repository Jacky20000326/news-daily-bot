import { generatePodcast } from '../src/podcast';
import type { DailyReport, AnalyzedNewsItem } from '../src/types';
import { logger } from '../src/utils/logger';

/**
 * 測試 NotebookLM Podcast 功能
 * 使用隨意的測試數據呼叫 generatePodcast()
 */
async function testPodcast() {
  // ─── 構造測試數據 ───────────────────────────────────────────────────────

  // 模擬 10 則新聞
  const categories: Array<'market' | 'regulation' | 'technology' | 'defi' | 'nft' | 'security' | 'macro' | 'exchange' | 'other'> =
    ['market', 'regulation', 'technology', 'defi', 'nft', 'security', 'macro', 'exchange'];

  const sentiments: Array<'positive' | 'negative' | 'neutral'> = ['positive', 'negative', 'neutral'];
  const tickers: Array<Array<string>> = [['BTC'], ['ETH'], ['SOL'], ['XRP']];

  const testStories: AnalyzedNewsItem[] = Array.from({ length: 10 }, (_, i) => ({
    id: `test-story-${i + 1}`,
    url: `https://example.com/news/${i + 1}`,
    title: `測試新聞 #${i + 1}: ${['比特幣突破新高', '以太坊升級啟動', 'DeFi生態繁榮', '監管新政推出', '交易所安全事件', 'NFT市場復甦', '技術創新進展', '宏觀經濟影響', '市場行情分析', '安全漏洞修復'][i]}`,
    content: `這是第 ${i + 1} 則新聞的完整內容。包含市場分析、背景脈絡和影響評估。`,
    publishedAt: new Date(Date.now() - (10 - i) * 60 * 60 * 1000),
    sourceName: ['CoinDesk', 'NewsAPI', 'CryptoPanic', 'Messari'][i % 4],
    sourceType: 'newsapi' as const,
    author: `作者 ${i + 1}`,
    imageUrl: `https://example.com/image/${i + 1}.jpg`,
    tags: ['加密貨幣', '市場', ['區塊鏈', '技術'][i % 2]],
    importanceScore: 10 - (i % 3),  // 8-10 的評分
    category: categories[i % categories.length],
    relatedTickers: tickers[i % tickers.length],
    sentiment: sentiments[i % sentiments.length],
    aiSummary: `第 ${i + 1} 則新聞摘要（100-150字）：這則新聞重點涵蓋市場動態、政策影響以及技術進展。加密貨幣市場在過去24小時內表現出明顯的趨勢變化，多個主要幣種錄得顯著漲幅。分析師認為這與全球經濟形勢和監管政策的變化密切相關。預期未來行情將保持波動，投資者應密切關注相關動態。`,
    deepAnalysis: `深度分析報告（第 ${i + 1} 則新聞）\n\n**背景脈絡：**\n這則新聞涉及加密貨幣市場的重要發展。過去一週內，市場經歷了多次重大事件，包括監管政策的調整、技術升級的推進，以及機構投資者參與度的提升。\n\n**市場影響評估：**\n短期內，該事件預期將對比特幣和以太坊價格造成上行壓力，同時帶動整個生態的資金流入。從交易量和鏈上活動來看，市場興趣度顯著提升。\n\n**相關方利益分析：**\n利好：主要交易所、DeFi協議、機構投資者\n利空：傳統金融機構、監管部門\n中性：個人零售投資者\n\n**未來展望：**\n預期在未來1-3個月內，市場將進入新的上升週期。但風險因素包括宏觀經濟波動、政策突變等。建議投資者保持謹慎樂觀態度。`,
  }));

  // 構造完整的 DailyReport
  const testReport: DailyReport = {
    reportDate: '2026-04-12',
    generatedAt: new Date(),
    timeWindowFrom: new Date('2026-04-11T16:00:00Z'),  // 2026-04-12 00:00 Taipei
    timeWindowTo: new Date('2026-04-12T01:00:00Z'),    // 2026-04-12 09:00 Taipei
    totalCollected: 150,
    afterDedup: 45,
    topStories: testStories,
    executiveSummary: `加密貨幣市場今日呈現強勢上漲格局。比特幣在 $43,500-$44,000 區間震盪，整體表現穩健。以太坊隨之上漲，DeFi生態資金流入顯著增加。監管層面，多國政策趨於友善，給市場注入信心。預期短期行情將保持上升勢頭，但需留意宏觀經濟因素的影響。主要機構投資者持續增加倉位，顯示市場信心穩定。整體來看，市場進入新一輪上升週期的可能性較大。`,
    sources: ['CoinDesk', 'NewsAPI', 'CryptoPanic', 'Messari'],
    mdReportUrl: 'https://pages.example.com/reports/2026-04-12.html',
  };

  // ─── 測試開始 ───────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(80));
  console.log('🎙️  NotebookLM Podcast 功能測試開始');
  console.log('='.repeat(80) + '\n');

  console.log('📋 報告信息：');
  console.log(`  日期: ${testReport.reportDate}`);
  console.log(`  新聞數: ${testReport.topStories.length}`);
  console.log(`  執行摘要長度: ${testReport.executiveSummary.length} 字元`);
  console.log('');

  const startTime = Date.now();

  try {
    console.log('⏳ 正在生成 Podcast...\n');

    // 調用 generatePodcast
    const audioBuffer = await generatePodcast(testReport);

    const duration = Date.now() - startTime;
    const durationMin = (duration / 1000 / 60).toFixed(1);

    // ─── 結果分析 ───────────────────────────────────────────────────────

    console.log('\n✅ Podcast 生成成功！\n');
    console.log('📊 結果信息：');
    console.log(`  音檔大小: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  總耗時: ${durationMin} 分鐘 (${duration} 毫秒)`);
    console.log(`  音檔類型: MP3 (NotebookLM Audio Overview)`);
    console.log('');

    // 驗證 Buffer
    console.log('🔍 音檔驗證：');
    if (audioBuffer.length > 0) {
      console.log(`  ✓ 音檔數據正確載入 (${audioBuffer.length} 字節)`);
    } else {
      console.log(`  ✗ 音檔為空`);
    }

    // 檢查 MP3 簽名
    const firstThreeBytes = Buffer.alloc(3);
    audioBuffer.copy(firstThreeBytes, 0, 0, 3);
    const mp3Header = firstThreeBytes.toString('hex');
    if (mp3Header === '494433') {
      console.log(`  ✓ MP3 ID3 標籤驗證通過 (0x${mp3Header})`);
    } else {
      console.log(`  ℹ 音檔開頭: 0x${mp3Header}`);
    }

    console.log('');
    console.log('💾 下一步行動：');
    console.log('  1. 音檔可推送至 GitHub Pages: audio/2026-04-12.mp3');
    console.log('  2. 可在郵件中包含播放連結');
    console.log('  3. 建議品質驗證：用播放器試聽');

    console.log('\n' + '='.repeat(80));
    console.log('✨ 測試完成 - NotebookLM Podcast 功能正常運作');
    console.log('='.repeat(80) + '\n');

    return {
      success: true as const,
      audioSize: audioBuffer.length,
      duration,
      buffer: audioBuffer,
    };
  } catch (err) {
    const duration = Date.now() - startTime;

    console.log('\n❌ Podcast 生成失敗\n');
    console.log('⚠️  錯誤信息：');
    console.log(`  ${err instanceof Error ? err.message : String(err)}`);
    console.log('');

    if (err instanceof Error) {
      console.log('📍 錯誤堆棧：');
      console.log(err.stack);
    }

    console.log('');
    console.log('🔧 故障排除建議：');
    console.log('  1. 檢查認證配置（credentials.json 或環境變數）');
    console.log('  2. 驗證 NotebookLM 帳號是否可正常訪問');
    console.log('  3. 檢查網路連線和防火牆');
    console.log('  4. 檢查 notebooklm-config.json 中的 buildLabel 是否過期');
    console.log('  5. 執行 pnpm ts-node scripts/auto-login.ts 更新配置');
    console.log('');

    console.log(`⏱️  耗時: ${(duration / 1000).toFixed(1)} 秒\n`);

    console.log('='.repeat(80));
    console.log('❌ 測試失敗');
    console.log('='.repeat(80) + '\n');

    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration,
    };
  }
}

// 執行測試
testPodcast().then((result: any) => {
  if (result.success) {
    logger.info('Podcast 測試成功', {
      audioSize: (result.audioSize / 1024 / 1024).toFixed(2) + ' MB',
      duration: result.duration + ' ms',
    });
  } else {
    logger.error('Podcast 測試失敗', {
      error: result.error || 'Unknown error',
      duration: result.duration + ' ms',
    });
    process.exit(1);
  }
});
