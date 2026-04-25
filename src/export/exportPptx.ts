import PptxGenJS from 'pptxgenjs';
import type {
  ClassSession,
  DictionaryEntry,
  ExportOptions,
  Meaning,
  Register,
  Syllable,
} from '../types/dictionary';
import { translate, type StringKey, type UILang } from '../i18n';

/* ────────────────────────────────────────────────────────────────
 * Slide geometry (16:9, 10 × 5.625 inch)
 * Units throughout this file: INCHES unless noted otherwise.
 * ─────────────────────────────────────────────────────────────── */
const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN_X = 0.5;
const MARGIN_TOP = 0.35;
const MARGIN_BOTTOM = 0.4;
const CONTENT_W = SLIDE_W - MARGIN_X * 2;
const CONTENT_LEFT = MARGIN_X;
const CONTENT_RIGHT_BOUND = SLIDE_W - MARGIN_X;

const COLOR = {
  heading: '1F2937',    // stone-800
  body: '374151',       // stone-700
  muted: '6B7280',      // stone-500
  faint: '9CA3AF',      // stone-400
  accent: 'B45309',     // amber-700
  accentSoft: 'FDE68A', // amber-200
  pinyin: '8B6B1F',     // deeper amber-ish gold
  rule: 'E5E7EB',       // stone-200
  bg: 'FFFFFF',
};

const FONT_CJK = 'Microsoft YaHei';
const FONT_LATIN = 'Calibri';

/* ────────────────────────────────────────────────────────────────
 * Ruby (pinyin-above-hanzi) rendering
 *
 * Key fix: each character occupies a FIXED width (not stretched to
 * fill the available area). So a short sentence like "你好。" stays
 * naturally compact on the left edge, not spread across the whole slide.
 * ─────────────────────────────────────────────────────────────── */

interface RubyStyle {
  /** Hanzi font-size in pt */
  hanziPt: number;
  /** Pinyin font-size in pt */
  pinyinPt: number;
  /** Width per character cell, in inches. ~0.62 * (pt / 72) * 2 for CJK. */
  charW: number;
  /** Height of hanzi row, in inches */
  hanziH: number;
  /** Height of pinyin row, in inches (only used when showPinyin) */
  pinyinH: number;
}

/** Reasonable defaults tuned so cells don't crop characters. */
function rubyStyle(hanziPt: number, pinyinPt: number): RubyStyle {
  // 1 pt ≈ 1/72 inch. CJK glyph is roughly square; allow 1.15x for breathing room.
  const charW = (hanziPt / 72) * 1.15;
  // Row heights: line-height 1.35 for hanzi, 1.5 for pinyin.
  const hanziH = (hanziPt * 1.35) / 72;
  const pinyinH = (pinyinPt * 1.5) / 72;
  return { hanziPt, pinyinPt, charW, hanziH, pinyinH };
}

/**
 * Render a ruby (pinyin-above-hanzi) sequence of syllables at (x, y).
 * Wraps onto multiple rows if it exceeds maxRowW. Returns the y coordinate
 * immediately BELOW the rendered block (caller advances from there).
 *
 * Characters are rendered with FIXED per-character column width, so the
 * output is naturally LEFT-ALIGNED within the given bounds.
 */
function addRuby(
  slide: PptxGenJS.Slide,
  syllables: Syllable[],
  opts: {
    x: number;
    y: number;
    maxRowW: number;
    showPinyin: boolean;
    style: RubyStyle;
    /** center the row horizontally within [x, x+maxRowW]? default false (left-align) */
    center?: boolean;
  },
): number {
  const { style } = opts;
  const perRow = Math.max(1, Math.floor(opts.maxRowW / style.charW));
  const rows: Syllable[][] = [];
  for (let i = 0; i < syllables.length; i += perRow) {
    rows.push(syllables.slice(i, i + perRow));
  }

  let y = opts.y;
  const rowGap = 0.06;

  for (const row of rows) {
    const rowW = row.length * style.charW;
    const rowX = opts.center
      ? opts.x + (opts.maxRowW - rowW) / 2
      : opts.x;

    // pinyin row (optional)
    if (opts.showPinyin) {
      row.forEach((s, i) => {
        slide.addText(s.pinyin || '', {
          x: rowX + i * style.charW,
          y,
          w: style.charW,
          h: style.pinyinH,
          fontSize: style.pinyinPt,
          fontFace: FONT_LATIN,
          color: COLOR.pinyin,
          italic: true,
          align: 'center',
          valign: 'bottom',
          margin: 0,
        });
      });
      y += style.pinyinH;
    }

    // hanzi row
    row.forEach((s, i) => {
      slide.addText(s.hanzi, {
        x: rowX + i * style.charW,
        y,
        w: style.charW,
        h: style.hanziH,
        fontSize: style.hanziPt,
        fontFace: FONT_CJK,
        color: COLOR.heading,
        align: 'center',
        valign: 'middle',
        margin: 0,
      });
    });
    y += style.hanziH + rowGap;
  }

  return y;
}

/* ────────────────────────────────────────────────────────────────
 * Height estimation helpers — needed so meanings don't overlap.
 * pptxgenjs can't measure text for us, so we approximate based on
 * character count and column width.
 * ─────────────────────────────────────────────────────────────── */

/** Rough visual character width for Latin text at a given pt size, in inches. */
function latinCharW(pt: number): number {
  // Average glyph width ~0.5 em for proportional fonts.
  return (pt / 72) * 0.5;
}

/** Estimate how many inches tall a Latin text block will be. */
function estimateLatinH(text: string, pt: number, widthIn: number): number {
  const charsPerLine = Math.max(10, Math.floor(widthIn / latinCharW(pt)));
  // Soft-wrap by whitespace: approximate line count.
  const words = text.split(/\s+/);
  let lines = 1;
  let col = 0;
  for (const w of words) {
    if (col + w.length + 1 > charsPerLine) {
      lines++;
      col = w.length + 1;
    } else {
      col += w.length + 1;
    }
  }
  const lineH = (pt * 1.35) / 72;
  return lines * lineH;
}

/** Height a ruby block will take given syllable count + row-width budget. */
function estimateRubyH(
  syllables: Syllable[],
  maxRowW: number,
  showPinyin: boolean,
  style: RubyStyle,
): number {
  const perRow = Math.max(1, Math.floor(maxRowW / style.charW));
  const rows = Math.ceil(syllables.length / perRow);
  const perRowH = style.hanziH + (showPinyin ? style.pinyinH : 0) + 0.06;
  return rows * perRowH;
}

/* ────────────────────────────────────────────────────────────────
 * Date helpers
 * ─────────────────────────────────────────────────────────────── */

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ────────────────────────────────────────────────────────────────
 * Cover slide
 * ─────────────────────────────────────────────────────────────── */

function buildCoverSlide(
  pres: PptxGenJS,
  sessions: ClassSession[],
  entries: DictionaryEntry[],
  title: string,
  uiLang: UILang,
) {
  const slide = pres.addSlide();
  slide.background = { color: 'FAFAF7' };

  // Big centered title
  slide.addText(title, {
    x: MARGIN_X,
    y: 1.4,
    w: CONTENT_W,
    h: 1.1,
    fontSize: 40,
    fontFace: FONT_CJK,
    bold: true,
    color: COLOR.heading,
    align: 'center',
    valign: 'middle',
  });

  // Session summary
  const sessionLine =
    sessions.length === 1
      ? sessions[0].name
      : translate(uiLang, 'pptGroupCount', { n: sessions.length });
  slide.addText(sessionLine, {
    x: MARGIN_X,
    y: 2.6,
    w: CONTENT_W,
    h: 0.5,
    fontSize: 18,
    fontFace: FONT_CJK,
    color: COLOR.accent,
    align: 'center',
    valign: 'middle',
  });

  // Entry count & date range
  const dates =
    entries.length > 0
      ? `${formatDate(entries[0].queriedAt)} — ${formatDate(entries[entries.length - 1].queriedAt)}`
      : formatDate(Date.now());
  slide.addText(
    [
      {
        text: translate(uiLang, 'pptEntriesCount', { n: entries.length }),
        options: { breakLine: true },
      },
      { text: dates, options: {} },
    ],
    {
      x: MARGIN_X,
      y: 3.3,
      w: CONTENT_W,
      h: 0.9,
      fontSize: 14,
      fontFace: FONT_LATIN,
      color: COLOR.muted,
      align: 'center',
      valign: 'top',
    },
  );

  slide.addText(translate(uiLang, 'pptFooterBrand'), {
    x: MARGIN_X,
    y: SLIDE_H - 0.4,
    w: CONTENT_W,
    h: 0.25,
    fontSize: 10,
    color: COLOR.faint,
    align: 'center',
    fontFace: FONT_LATIN,
  });
}

/* ────────────────────────────────────────────────────────────────
 * Entry slide (one word; may overflow to more slides)
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │                           (header: lang · date)             │
 *   │                                                              │
 *   │                    pinyin (centered above hanzi)             │
 *   │                    ────── WORD ───────                        │
 *   │  ───────────────────── rule ──────────────────────            │
 *   │                                                              │
 *   │  ① [NOUN]  读音：cháng                                        │
 *   │     Of great extent from end to end...                        │
 *   │     Example:                                                  │
 *   │     Zhè tiáo hé hěn cháng.                                    │
 *   │     这 条 河 很 长 。       (ruby, LEFT-aligned, fixed width)   │
 *   │     This river is very long.                                  │
 *   │                                                              │
 *   │  ② [VERB]  读音：zhǎng                                        │
 *   │     ...                                                      │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * If the accumulated meanings exceed SLIDE_H, remaining meanings are
 * rendered on continuation slides.
 * ─────────────────────────────────────────────────────────────── */

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

/** Width budget for the definition/example column (indented under the numbering). */
const MEANING_INDENT = 0.35;
const MEANING_W = CONTENT_W - MEANING_INDENT;

const DEF_PT = 13;
const EX_LABEL_PT = 10;
const EX_TRANS_PT = 11;

const RUBY_WORD_STYLE = rubyStyle(42, 14); // large, for the title word (forward mode)
const RUBY_EX_STYLE = rubyStyle(16, 9); // body-sized, for example sentences
const RUBY_CAND_STYLE = rubyStyle(28, 11); // medium-large, for Chinese candidates (reverse mode)

/* Reverse-mode register pill colors — mirrored from the React UI. */
const REGISTER_KEY: Record<Register, StringKey> = {
  casual: 'registerCasual',
  colloquial: 'registerColloquial',
  neutral: 'registerNeutral',
  formal: 'registerFormal',
  literary: 'registerLiterary',
};
const REGISTER_PPT_COLOR: Record<Register, { bg: string; fg: string }> = {
  casual: { bg: 'FCE7F3', fg: 'BE185D' },     // pink-100  / pink-700
  colloquial: { bg: 'DBEAFE', fg: '1D4ED8' }, // blue-100  / blue-700
  neutral: { bg: 'F5F5F4', fg: '57534E' },    // stone-100 / stone-700
  formal: { bg: 'D1FAE5', fg: '047857' },     // emerald-100 / emerald-700
  literary: { bg: 'EDE9FE', fg: '6D28D9' },   // violet-100 / violet-700
};

/** Compute total height a single meaning block will consume. */
function measureMeaningHeight(
  m: DictionaryEntry['meanings'][number],
  includePinyin: boolean,
  includeTranslation: boolean,
): number {
  let h = 0;
  // Header line: "① [POS]  读音: xxx"
  h += 0.34;
  // Definition (wraps)
  h += estimateLatinH(m.definition, DEF_PT, MEANING_W) + 0.08;
  // Example label
  h += 0.24;
  // Ruby example
  h += estimateRubyH(m.example.chinese, MEANING_W, includePinyin, RUBY_EX_STYLE);
  // Translation line
  if (includeTranslation) {
    h += estimateLatinH(m.example.translation, EX_TRANS_PT, MEANING_W) + 0.05;
  }
  // Inter-block gap
  h += 0.25;
  return h;
}

function addEntryHeader(
  slide: PptxGenJS.Slide,
  entry: DictionaryEntry,
  includePinyin: boolean,
): number {
  // Top-right header: "English · 2026-04-23"
  slide.addText(`${entry.language} · ${formatDate(entry.queriedAt)}`, {
    x: MARGIN_X,
    y: MARGIN_TOP,
    w: CONTENT_W,
    h: 0.25,
    fontSize: 9,
    color: COLOR.faint,
    align: 'right',
    fontFace: FONT_LATIN,
    margin: 0,
  });

  // Word title (ruby, CENTERED within content area)
  const wordY = MARGIN_TOP + 0.35;
  const afterY = addRuby(slide, entry.wordSyllables, {
    x: CONTENT_LEFT,
    y: wordY,
    maxRowW: CONTENT_W,
    showPinyin: includePinyin,
    style: RUBY_WORD_STYLE,
    center: true,
  });

  // Horizontal rule under the word
  const ruleY = afterY + 0.15;
  slide.addShape('line' as unknown as PptxGenJS.ShapeType, {
    x: MARGIN_X,
    y: ruleY,
    w: CONTENT_W,
    h: 0,
    line: { color: COLOR.rule, width: 0.75 },
  });

  return ruleY + 0.22;
}

function addFooter(slide: PptxGenJS.Slide, text: string) {
  slide.addText(text, {
    x: MARGIN_X,
    y: SLIDE_H - 0.3,
    w: CONTENT_W,
    h: 0.22,
    fontSize: 8,
    color: COLOR.faint,
    align: 'center',
    fontFace: FONT_LATIN,
    margin: 0,
  });
}

function addMeaningBlock(
  slide: PptxGenJS.Slide,
  m: DictionaryEntry['meanings'][number],
  idx: number,
  startY: number,
  opts: ExportOptions,
  uiLang: UILang,
): number {
  const marker = CIRCLED[idx] ?? `${idx + 1}.`;
  let y = startY;

  // Header row (numbering + POS tag + optional pinyin hint)
  const headerParts: PptxGenJS.TextProps[] = [
    {
      text: `${marker}  `,
      options: {
        fontSize: 14,
        bold: true,
        color: COLOR.accent,
        fontFace: FONT_LATIN,
      },
    },
    {
      text: `[${m.partOfSpeech}]  `,
      options: {
        fontSize: 10,
        color: COLOR.muted,
        fontFace: FONT_LATIN,
        italic: true,
      },
    },
  ];
  if (m.pinyin) {
    headerParts.push({
      text: `${translate(uiLang, 'pronunciation')}${m.pinyin}`,
      options: {
        fontSize: 10,
        color: COLOR.pinyin,
        fontFace: FONT_LATIN,
        italic: true,
      },
    });
  }
  slide.addText(headerParts, {
    x: MARGIN_X,
    y,
    w: CONTENT_W,
    h: 0.32,
    valign: 'middle',
    margin: 0,
  });
  y += 0.34;

  // Definition (freely wraps, allocate estimated height)
  const defH = Math.max(
    0.3,
    estimateLatinH(m.definition, DEF_PT, MEANING_W),
  );
  slide.addText(m.definition, {
    x: MARGIN_X + MEANING_INDENT,
    y,
    w: MEANING_W,
    h: defH,
    fontSize: DEF_PT,
    fontFace: FONT_LATIN,
    color: COLOR.body,
    valign: 'top',
    align: 'left',
    margin: 0,
  });
  y += defH + 0.08;

  // "Example" label
  slide.addText(translate(uiLang, 'example'), {
    x: MARGIN_X + MEANING_INDENT,
    y,
    w: MEANING_W,
    h: 0.22,
    fontSize: EX_LABEL_PT,
    fontFace: FONT_LATIN,
    color: COLOR.muted,
    align: 'left',
    valign: 'bottom',
    margin: 0,
  });
  y += 0.24;

  // Ruby example sentence (left-aligned, fixed per-char width)
  y = addRuby(slide, m.example.chinese, {
    x: MARGIN_X + MEANING_INDENT,
    y,
    maxRowW: MEANING_W,
    showPinyin: opts.includePinyin,
    style: RUBY_EX_STYLE,
    center: false,
  });

  // Translation
  if (opts.includeExampleTranslation) {
    const trH = Math.max(
      0.25,
      estimateLatinH(m.example.translation, EX_TRANS_PT, MEANING_W),
    );
    slide.addText(m.example.translation, {
      x: MARGIN_X + MEANING_INDENT,
      y,
      w: MEANING_W,
      h: trH,
      fontSize: EX_TRANS_PT,
      fontFace: FONT_LATIN,
      color: COLOR.muted,
      italic: true,
      align: 'left',
      valign: 'top',
      margin: 0,
    });
    y += trH + 0.05;
  }

  // Trailing gap between meanings
  return y + 0.18;
}

/* ────────────────────────────────────────────────────────────────
 * Reverse-mode (other→zh) header & meaning block.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │                       (header: lang · date)                  │
 *   │                                                              │
 *   │                       Source-language word                   │
 *   │                  English → Chinese · 3 candidates             │
 *   │  ───────────────────── rule ──────────────────────            │
 *   │                                                              │
 *   │  ① 高 兴   [casual]   [adjective]                              │
 *   │      gāo xìng                                                 │
 *   │     When to use:                                              │
 *   │     Everyday spoken expression for being happy...             │
 *   │     Example:                                                  │
 *   │     wǒ hěn gāo xìng                                           │
 *   │     我 很 高 兴 。                                             │
 *   │     I'm very happy.                                           │
 *   └──────────────────────────────────────────────────────────────┘
 * ─────────────────────────────────────────────────────────────── */

function addReverseEntryHeader(
  slide: PptxGenJS.Slide,
  entry: DictionaryEntry,
  uiLang: UILang,
): number {
  // Top-right header: detected source language + date
  slide.addText(`${entry.language} · ${formatDate(entry.queriedAt)}`, {
    x: MARGIN_X,
    y: MARGIN_TOP,
    w: CONTENT_W,
    h: 0.25,
    fontSize: 9,
    color: COLOR.faint,
    align: 'right',
    fontFace: FONT_LATIN,
    margin: 0,
  });

  // Source-language word/phrase, plain text, large bold, centered.
  // Use a generous height so long sentences wrap.
  const titleY = MARGIN_TOP + 0.35;
  const titleH = 1.0;
  slide.addText(entry.word, {
    x: CONTENT_LEFT,
    y: titleY,
    w: CONTENT_W,
    h: titleH,
    fontSize: 28,
    bold: true,
    fontFace: FONT_LATIN,
    color: COLOR.heading,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
  let afterY = titleY + titleH;

  // Subline: "X → Chinese · N candidate(s)"
  const n = entry.meanings.length;
  const subLine =
    n > 1
      ? translate(uiLang, 'chineseCandidatesLine', { lang: entry.language, n })
      : translate(uiLang, 'chineseCandidatesLineSingle', {
          lang: entry.language,
        });
  slide.addText(subLine, {
    x: CONTENT_LEFT,
    y: afterY + 0.05,
    w: CONTENT_W,
    h: 0.3,
    fontSize: 11,
    fontFace: FONT_LATIN,
    color: COLOR.muted,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
  afterY += 0.4;

  const ruleY = afterY + 0.1;
  slide.addShape('line' as unknown as PptxGenJS.ShapeType, {
    x: MARGIN_X,
    y: ruleY,
    w: CONTENT_W,
    h: 0,
    line: { color: COLOR.rule, width: 0.75 },
  });
  return ruleY + 0.18;
}

function measureReverseMeaningHeight(
  m: Meaning,
  includePinyin: boolean,
  includeTranslation: boolean,
): number {
  let h = 0;
  // Chinese candidate ruby
  const candidate = m.hanziSyllables ?? [];
  h += estimateRubyH(candidate, CONTENT_W - 0.45, includePinyin, RUBY_CAND_STYLE);
  // Register pill + POS row
  h += 0.3;
  // "When to use" label
  h += 0.24;
  // Definition
  h += estimateLatinH(m.definition, DEF_PT, MEANING_W) + 0.08;
  // Example label
  h += 0.24;
  // Example ruby
  h += estimateRubyH(m.example.chinese, MEANING_W, includePinyin, RUBY_EX_STYLE);
  // Translation
  if (includeTranslation) {
    h += estimateLatinH(m.example.translation, EX_TRANS_PT, MEANING_W) + 0.05;
  }
  // Trailing gap
  h += 0.25;
  return h;
}

function addReverseMeaningBlock(
  slide: PptxGenJS.Slide,
  m: Meaning,
  idx: number,
  startY: number,
  opts: ExportOptions,
  uiLang: UILang,
): number {
  const marker = CIRCLED[idx] ?? `${idx + 1}.`;
  let y = startY;

  // Marker — sits to the left of the candidate ruby. Use the ruby's hanzi cell
  // height as the visual baseline so the number sits at character-height.
  const markerH = RUBY_CAND_STYLE.hanziH + (opts.includePinyin ? RUBY_CAND_STYLE.pinyinH : 0);
  slide.addText(marker, {
    x: MARGIN_X,
    y,
    w: 0.45,
    h: markerH,
    fontSize: 18,
    bold: true,
    color: COLOR.accent,
    fontFace: FONT_LATIN,
    align: 'left',
    valign: opts.includePinyin ? 'bottom' : 'middle',
    margin: 0,
  });

  // Chinese candidate (ruby), indented past the marker
  const candidate = m.hanziSyllables ?? [];
  if (candidate.length) {
    y = addRuby(slide, candidate, {
      x: MARGIN_X + 0.45,
      y,
      maxRowW: CONTENT_W - 0.45,
      showPinyin: opts.includePinyin,
      style: RUBY_CAND_STYLE,
      center: false,
    });
  } else {
    y += 0.3;
  }

  // Register pill + POS tag, on a single line, indented under the candidate.
  const reg = m.register;
  let pillX = MARGIN_X + MEANING_INDENT;
  const pillRowH = 0.24;
  if (reg) {
    const colors = REGISTER_PPT_COLOR[reg];
    const label = translate(uiLang, REGISTER_KEY[reg]);
    const pillW = 0.85;
    slide.addText(label, {
      x: pillX,
      y,
      w: pillW,
      h: pillRowH,
      fontSize: 9,
      fontFace: FONT_LATIN,
      color: colors.fg,
      bold: true,
      fill: { color: colors.bg },
      align: 'center',
      valign: 'middle',
      margin: 0,
    });
    pillX += pillW + 0.08;
  }
  slide.addText(`[${m.partOfSpeech}]`, {
    x: pillX,
    y,
    w: CONTENT_W - (pillX - MARGIN_X),
    h: pillRowH,
    fontSize: 9,
    italic: true,
    fontFace: FONT_LATIN,
    color: COLOR.muted,
    align: 'left',
    valign: 'middle',
    margin: 0,
  });
  y += pillRowH + 0.08;

  // "When to use" label
  slide.addText(translate(uiLang, 'usageNote'), {
    x: MARGIN_X + MEANING_INDENT,
    y,
    w: MEANING_W,
    h: 0.22,
    fontSize: EX_LABEL_PT,
    fontFace: FONT_LATIN,
    color: COLOR.muted,
    align: 'left',
    valign: 'bottom',
    margin: 0,
  });
  y += 0.24;

  // Definition (usage note in source language)
  const defH = Math.max(
    0.3,
    estimateLatinH(m.definition, DEF_PT, MEANING_W),
  );
  slide.addText(m.definition, {
    x: MARGIN_X + MEANING_INDENT,
    y,
    w: MEANING_W,
    h: defH,
    fontSize: DEF_PT,
    fontFace: FONT_LATIN,
    color: COLOR.body,
    valign: 'top',
    align: 'left',
    margin: 0,
  });
  y += defH + 0.08;

  // Example label
  slide.addText(translate(uiLang, 'example'), {
    x: MARGIN_X + MEANING_INDENT,
    y,
    w: MEANING_W,
    h: 0.22,
    fontSize: EX_LABEL_PT,
    fontFace: FONT_LATIN,
    color: COLOR.muted,
    align: 'left',
    valign: 'bottom',
    margin: 0,
  });
  y += 0.24;

  // Ruby example
  y = addRuby(slide, m.example.chinese, {
    x: MARGIN_X + MEANING_INDENT,
    y,
    maxRowW: MEANING_W,
    showPinyin: opts.includePinyin,
    style: RUBY_EX_STYLE,
    center: false,
  });

  // Translation (in source language)
  if (opts.includeExampleTranslation) {
    const trH = Math.max(
      0.25,
      estimateLatinH(m.example.translation, EX_TRANS_PT, MEANING_W),
    );
    slide.addText(m.example.translation, {
      x: MARGIN_X + MEANING_INDENT,
      y,
      w: MEANING_W,
      h: trH,
      fontSize: EX_TRANS_PT,
      fontFace: FONT_LATIN,
      color: COLOR.muted,
      italic: true,
      align: 'left',
      valign: 'top',
      margin: 0,
    });
    y += trH + 0.05;
  }

  return y + 0.2;
}

/* ────────────────────────────────────────────────────────────────
 * Continuation slide header (used by both directions when a single entry
 * spans more than one slide).
 * ─────────────────────────────────────────────────────────────── */

function addContinuationHeader(
  slide: PptxGenJS.Slide,
  entry: DictionaryEntry,
): number {
  const isReverse = entry.direction === 'other-to-zh';
  // Title varies per direction: hanzi (forward) or original input (reverse).
  const titleText = isReverse
    ? entry.word + '  …'
    : entry.wordSyllables.map((s) => s.hanzi).join('') + '  …';
  slide.addText(titleText, {
    x: MARGIN_X,
    y: MARGIN_TOP,
    w: CONTENT_W,
    h: 0.35,
    fontSize: 18,
    bold: true,
    fontFace: isReverse ? FONT_LATIN : FONT_CJK,
    color: COLOR.heading,
    align: 'left',
    valign: 'middle',
    margin: 0,
  });
  slide.addText(`${entry.language} · ${formatDate(entry.queriedAt)}`, {
    x: MARGIN_X,
    y: MARGIN_TOP,
    w: CONTENT_W,
    h: 0.35,
    fontSize: 9,
    color: COLOR.faint,
    align: 'right',
    fontFace: FONT_LATIN,
    margin: 0,
  });
  slide.addShape('line' as unknown as PptxGenJS.ShapeType, {
    x: MARGIN_X,
    y: MARGIN_TOP + 0.45,
    w: CONTENT_W,
    h: 0,
    line: { color: COLOR.rule, width: 0.75 },
  });
  return MARGIN_TOP + 0.6;
}

function buildEntrySlides(
  pres: PptxGenJS,
  entry: DictionaryEntry,
  opts: ExportOptions,
  uiLang: UILang,
) {
  const isReverse = entry.direction === 'other-to-zh';

  // Start first slide with full header
  let slide = pres.addSlide();
  slide.background = { color: COLOR.bg };
  let y = isReverse
    ? addReverseEntryHeader(slide, entry, uiLang)
    : addEntryHeader(slide, entry, opts.includePinyin);
  const availableBottom = SLIDE_H - MARGIN_BOTTOM - 0.3; // leave room for footer

  entry.meanings.forEach((m, idx) => {
    const needed = isReverse
      ? measureReverseMeaningHeight(
          m,
          opts.includePinyin,
          opts.includeExampleTranslation,
        )
      : measureMeaningHeight(
          m,
          opts.includePinyin,
          opts.includeExampleTranslation,
        );

    // If this meaning won't fit, flush footer + start a continuation slide.
    if (y + needed > availableBottom && idx > 0) {
      addFooter(slide, translate(uiLang, 'pptFooterBrand'));
      slide = pres.addSlide();
      slide.background = { color: COLOR.bg };
      y = addContinuationHeader(slide, entry);
    }

    y = isReverse
      ? addReverseMeaningBlock(slide, m, idx, y, opts, uiLang)
      : addMeaningBlock(slide, m, idx, y, opts, uiLang);
  });

  addFooter(slide, translate(uiLang, 'pptFooterBrand'));
}

/* ────────────────────────────────────────────────────────────────
 * Public entry point
 * ─────────────────────────────────────────────────────────────── */

export async function exportToPptx(
  sessions: ClassSession[],
  entries: DictionaryEntry[],
  opts: ExportOptions,
  uiLang: UILang = 'zh',
): Promise<void> {
  if (!entries.length) {
    throw new Error(translate(uiLang, 'nothingToExport'));
  }

  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'NOTE_DICT_16_9', width: SLIDE_W, height: SLIDE_H });
  pres.layout = 'NOTE_DICT_16_9';

  const title =
    opts.title?.trim() ||
    (sessions.length === 1
      ? sessions[0].name
      : translate(uiLang, 'appTitle'));

  buildCoverSlide(pres, sessions, entries, title, uiLang);
  entries.forEach((entry) => buildEntrySlides(pres, entry, opts, uiLang));

  const filename = `${title.replace(/[\\/:*?"<>|]/g, '_')}-${formatDate(Date.now())}.pptx`;
  await pres.writeFile({ fileName: filename });
}

// CONTENT_RIGHT_BOUND exported for possible future consumers
export { CONTENT_RIGHT_BOUND };
