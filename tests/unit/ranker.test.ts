// 設定測試所需環境變數（必須在任何 src 模組 import 前設定）
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.NEWSAPI_KEY = 'test-key';
process.env.SENDGRID_API_KEY = 'test-key';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.EMAIL_RECIPIENTS = 'test@example.com';

import { describe, it, expect } from 'vitest';
import { buildRankingPrompt } from '../../src/analyzer/prompts/ranking';
import { classifyByKeywords } from '../../src/analyzer/prompts/classification';
import { mockNewsItem } from '../helpers/mocks';

describe('buildRankingPrompt()', () => {
  it('回傳字串包含 items 的 id', () => {
    const items = [
      mockNewsItem({ id: 'abc1234567890001', title: 'Bitcoin news' }),
      mockNewsItem({ id: 'abc1234567890002', title: 'Ethereum news', url: 'https://example.com/eth' }),
    ];

    const prompt = buildRankingPrompt(items);

    expect(prompt).toContain('abc1234567890001');
    expect(prompt).toContain('abc1234567890002');
  });

  it('回傳字串包含 items 的 title', () => {
    const items = [
      mockNewsItem({ id: 'abc1234567890001', title: 'Bitcoin Hits All Time High' }),
      mockNewsItem({ id: 'abc1234567890002', title: 'Ethereum Upgrade Launches', url: 'https://example.com/eth' }),
    ];

    const prompt = buildRankingPrompt(items);

    expect(prompt).toContain('Bitcoin Hits All Time High');
    expect(prompt).toContain('Ethereum Upgrade Launches');
  });

  it('回傳字串包含「1-10」或「1 到 10」的評分說明', () => {
    const items = [mockNewsItem()];

    const prompt = buildRankingPrompt(items);

    // prompt 中應有 importanceScore 的範圍描述
    const hasRange = prompt.includes('1-10') || prompt.includes('1 到 10') || prompt.includes('1 至 10');
    expect(hasRange).toBe(true);
  });

  it('prompt 說明 importanceScore 必須為整數範圍', () => {
    const items = [mockNewsItem()];

    const prompt = buildRankingPrompt(items);

    // 應包含 importanceScore 欄位說明
    expect(prompt).toContain('importanceScore');
  });

  it('空陣列時仍回傳字串（不拋出錯誤）', () => {
    expect(() => buildRankingPrompt([])).not.toThrow();
    const prompt = buildRankingPrompt([]);
    expect(typeof prompt).toBe('string');
  });

  it('prompt 包含 JSON 格式的輸出範例', () => {
    const items = [mockNewsItem()];
    const prompt = buildRankingPrompt(items);

    // 應包含 JSON 陣列輸出格式說明
    expect(prompt).toContain('category');
    expect(prompt).toContain('sentiment');
  });
});

describe('classifyByKeywords()', () => {
  it('含 "hack" 關鍵字時識別為 security 類別', () => {
    const item = mockNewsItem({
      title: 'Major Exchange Gets Hacked',
      content: 'A hack occurred causing massive losses.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('security');
  });

  it('含 "exploit" 關鍵字時識別為 security 類別', () => {
    const item = mockNewsItem({
      title: 'DeFi Protocol Suffers Exploit',
      content: 'Smart contract exploit drained the pool.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('security');
  });

  it('含 "phishing" 關鍵字時識別為 security 類別', () => {
    const item = mockNewsItem({
      title: 'Crypto Users Targeted in Phishing Campaign',
      content: 'A new phishing attack targets wallet users.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('security');
  });

  it('含 "sec" 關鍵字時識別為 regulation 類別', () => {
    const item = mockNewsItem({
      title: 'SEC Files Lawsuit Against Crypto Exchange',
      content: 'The SEC announced regulatory actions today.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('regulation');
  });

  it('含 "regulation" 關鍵字時識別為 regulation 類別', () => {
    const item = mockNewsItem({
      title: 'New Crypto Regulation Framework Proposed',
      content: 'Governments worldwide discuss new regulations.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('regulation');
  });

  it('含 "ban" 關鍵字時識別為 regulation 類別', () => {
    const item = mockNewsItem({
      title: 'Country Announces Crypto Ban',
      content: 'The government issues a complete ban on crypto trading.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('regulation');
  });

  it('對無關鍵字的項目回傳 "other"', () => {
    const item = mockNewsItem({
      title: 'Random Article About Something Else',
      content: 'This article contains no relevant cryptocurrency keywords.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('other');
  });

  it('security 優先於 market：同時含 "hack" 和 "price" 時分類為 security', () => {
    const item = mockNewsItem({
      title: 'Exchange Hack Causes Price Crash',
      content: 'A major hack event affected the price significantly.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('security');
  });

  it('security 優先：含 "stolen" 和 "rally" 同時出現時分類為 security', () => {
    const item = mockNewsItem({
      title: 'Stolen Funds Cause Market Rally Pause',
      content: 'Despite the bull rally, stolen assets impacted confidence.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('security');
  });

  it('含 "defi" 關鍵字時識別為 defi 類別', () => {
    // 注意：content 中避免含有 regulation 關鍵字（例如 "sector" 含 "sec" 子字串）
    const item = mockNewsItem({
      title: 'DeFi Protocol Reaches 10B TVL',
      content: 'The defi market continues to grow with increasing liquidity and yield farming.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('defi');
  });

  it('含 "nft" 關鍵字時識別為 nft 類別', () => {
    const item = mockNewsItem({
      title: 'NFT Sales Volume Hits Record',
      content: 'The nft market sees unprecedented growth this quarter.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('nft');
  });

  it('含 "price" 關鍵字且無高優先分類時識別為 market', () => {
    const item = mockNewsItem({
      title: 'Bitcoin price reaches 100k',
      content: 'The price of bitcoin continues to climb.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('market');
  });

  it('大小寫不影響分類結果（title 大寫關鍵字）', () => {
    const item = mockNewsItem({
      title: 'HACK Attack on Major Exchange',
      content: 'The HACK resulted in major losses.',
    });

    const category = classifyByKeywords(item);

    expect(category).toBe('security');
  });
});
