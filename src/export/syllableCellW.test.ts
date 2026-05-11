/**
 * Regression tests for PPT ruby cell-width computation.
 *
 * Each test maps to a real bug we hit:
 *
 *   1. Long pinyin (zhāng / shuāng / chuáng — 5–6 chars) used to
 *      wrap onto two lines above its hanzi because every cell used
 *      a fixed width derived from the hanzi font size, ignoring how
 *      long the pinyin string actually was.  Commit f866b66 fixed
 *      this with a per-syllable max(hanziCellW, pinyinTextW + pad).
 *      The first test below FAILS if anyone reverts to a fixed
 *      hanzi-based width — the cellW for zhang would no longer fit
 *      its own pinyin.
 *
 *   2. Whitespace syllables ("空格", explicit inter-word " ") must
 *      render as a thin gap, not a full square void.  Verifies
 *      the dedicated branch is still in place.
 *
 *   3. Hanzi-only syllables with no pinyin (CJK punctuation, latin
 *      run-ins) must stay at the minimum hanziCellW so they don't
 *      get inflated by a phantom pinyin calculation.
 *
 *   4. Short syllables MUST remain compact at the hanzi base width.
 *      If anyone "simplifies" by always using the pinyin width,
 *      short syllables would shrink below readable hanzi width.
 */
import { describe, expect, it } from 'vitest';
import {
  pinyinTextW,
  rubyStyle,
  syllableCellW,
} from './exportPptx';

describe('syllableCellW — regression tests for PPT pinyin layout', () => {
  const exampleStyle = rubyStyle(16, 9); // body-sized example-sentence ruby

  it('long-pinyin cell (zhāng, 5 chars) is wide enough to fit the pinyin', () => {
    // Bug f866b66: pre-fix cells were 0.256" wide, but "zhāng" at
    // 9pt italic Latin is ~0.34" — overflowed and wrapped to 2
    // lines.  Post-fix the cell MUST be at least pinyin width + pad.
    const w = syllableCellW({ hanzi: '长', pinyin: 'zhǎng' }, exampleStyle);
    const pinyin = pinyinTextW('zhǎng', exampleStyle.pinyinPt);
    expect(w).toBeGreaterThanOrEqual(pinyin);
  });

  it('extra-long-pinyin cell (chuáng, 6 chars) is wide enough to fit the pinyin', () => {
    // Same logic as above with the longest plausible Mandarin pinyin.
    const w = syllableCellW({ hanzi: '床', pinyin: 'chuáng' }, exampleStyle);
    const pinyin = pinyinTextW('chuáng', exampleStyle.pinyinPt);
    expect(w).toBeGreaterThanOrEqual(pinyin);
  });

  it('whitespace syllable renders as a thin gap, not a full hanzi cell', () => {
    const w = syllableCellW({ hanzi: ' ', pinyin: '' }, exampleStyle);
    // Must be visibly smaller than a normal hanzi cell (so " " between
    // words doesn't blow out into a square void).
    expect(w).toBeLessThan(exampleStyle.hanziCellW);
    // But not zero — still a visible gap.
    expect(w).toBeGreaterThan(0.04);
  });

  it('punctuation cell with no pinyin uses just the hanzi base width', () => {
    const w = syllableCellW({ hanzi: '。', pinyin: '' }, exampleStyle);
    // Approx-equal because there's no padding to add for no-pinyin
    // cells; should land exactly at hanziCellW.
    expect(w).toBeCloseTo(exampleStyle.hanziCellW, 5);
  });

  it('short-pinyin cell (wǒ, 2 chars) stays compact at the hanzi base width', () => {
    // If someone "simplifies" by always taking pinyinTextW, short
    // syllables would shrink below readable hanzi width.  Floor must
    // be hanziCellW.
    const w = syllableCellW({ hanzi: '我', pinyin: 'wǒ' }, exampleStyle);
    expect(w).toBeCloseTo(exampleStyle.hanziCellW, 5);
  });

  it('long-pinyin cell is meaningfully WIDER than short-pinyin cell', () => {
    // Sanity check on the rhythm: a row of 5 zhāngs should be much
    // wider than a row of 5 wǒs, otherwise the variable-width
    // behavior doesn't actually do anything.
    const wLong = syllableCellW({ hanzi: '长', pinyin: 'zhǎng' }, exampleStyle);
    const wShort = syllableCellW({ hanzi: '我', pinyin: 'wǒ' }, exampleStyle);
    expect(wLong).toBeGreaterThan(wShort * 1.3); // at least 30% wider
  });
});
