import PptxGenJS from 'pptxgenjs';
import type {
  ClassSession,
  DictionaryEntry,
  ExportOptions,
  Syllable,
} from '../types/dictionary';

const SLIDE_W = 10; // inch (default 16:9 layout)
const SLIDE_H = 5.625;
const MARGIN = 0.4;
const CONTENT_W = SLIDE_W - MARGIN * 2;

const COLOR = {
  heading: '1F2937',
  muted: '6B7280',
  accent: 'B45309',
  pinyin: '8B6B1F',
  rule: 'E5E7EB',
};

const CJK_FONT = 'Microsoft YaHei';
const LATIN_FONT = 'Calibri';

/** split syllables into row chunks so a long sentence wraps across tables */
function chunkSyllables(syllables: Syllable[], maxPerRow: number): Syllable[][] {
  const out: Syllable[][] = [];
  for (let i = 0; i < syllables.length; i += maxPerRow) {
    out.push(syllables.slice(i, i + maxPerRow));
  }
  return out;
}

interface RubyOpts {
  x: number;
  y: number;
  w: number;
  hanziSize: number;
  pinyinSize: number;
  showPinyin: boolean;
  maxCharsPerRow?: number;
}

/** Render a ruby-style hanzi+pinyin block. Returns the Y where the caller can
 *  continue laying out content. */
function addRuby(
  slide: PptxGenJS.Slide,
  syllables: Syllable[],
  opts: RubyOpts,
): number {
  const maxPerRow = opts.maxCharsPerRow ?? 14;
  const chunks = chunkSyllables(syllables, maxPerRow);

  let y = opts.y;
  const hanziHeightIn = (opts.hanziSize * 1.5) / 72; // pt to inches approx
  const pinyinHeightIn = (opts.pinyinSize * 1.6) / 72;
  const rowGap = 0.05;

  for (const chunk of chunks) {
    const colCount = chunk.length;
    const colW = Array.from({ length: colCount }, () => opts.w / colCount);

    const rows: PptxGenJS.TableRow[] = [];
    if (opts.showPinyin) {
      rows.push(
        chunk.map((s) => ({
          text: s.pinyin || '',
          options: {
            fontSize: opts.pinyinSize,
            fontFace: LATIN_FONT,
            color: COLOR.pinyin,
            italic: true,
            align: 'center' as const,
            valign: 'bottom' as const,
          },
        })),
      );
    }
    rows.push(
      chunk.map((s) => ({
        text: s.hanzi,
        options: {
          fontSize: opts.hanziSize,
          fontFace: CJK_FONT,
          color: COLOR.heading,
          align: 'center' as const,
          valign: 'top' as const,
          bold: false,
        },
      })),
    );

    slide.addTable(rows, {
      x: opts.x,
      y,
      w: opts.w,
      colW,
      border: { type: 'none', pt: 0, color: 'FFFFFF' },
      margin: 0.02,
    });

    y += hanziHeightIn + (opts.showPinyin ? pinyinHeightIn : 0) + rowGap;
  }

  return y;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildCoverSlide(
  pres: PptxGenJS,
  sessions: ClassSession[],
  entries: DictionaryEntry[],
  title: string,
) {
  const slide = pres.addSlide();
  slide.background = { color: 'FAFAF7' };

  slide.addText(title, {
    x: MARGIN,
    y: 1.2,
    w: CONTENT_W,
    h: 1.0,
    fontSize: 40,
    fontFace: CJK_FONT,
    bold: true,
    color: COLOR.heading,
    align: 'center',
  });

  const sessionLine =
    sessions.length === 1
      ? sessions[0].name
      : `${sessions.length} 组课程 / 日期`;
  slide.addText(sessionLine, {
    x: MARGIN,
    y: 2.3,
    w: CONTENT_W,
    h: 0.5,
    fontSize: 18,
    fontFace: CJK_FONT,
    color: COLOR.accent,
    align: 'center',
  });

  const dates =
    entries.length > 0
      ? `${formatDate(entries[0].queriedAt)} — ${formatDate(entries[entries.length - 1].queriedAt)}`
      : formatDate(Date.now());
  slide.addText(
    [
      { text: `共 ${entries.length} 个词条`, options: { breakLine: true } },
      { text: dates, options: {} },
    ],
    {
      x: MARGIN,
      y: 3.0,
      w: CONTENT_W,
      h: 1.0,
      fontSize: 14,
      fontFace: LATIN_FONT,
      color: COLOR.muted,
      align: 'center',
    },
  );

  slide.addText('note.neooccidental.com · 课堂中文速查', {
    x: MARGIN,
    y: SLIDE_H - 0.5,
    w: CONTENT_W,
    h: 0.3,
    fontSize: 10,
    color: COLOR.muted,
    align: 'center',
    fontFace: LATIN_FONT,
  });
}

function buildEntrySlide(
  pres: PptxGenJS,
  entry: DictionaryEntry,
  opts: ExportOptions,
) {
  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };

  // Header: language + queried date
  slide.addText(
    `${entry.language} · ${formatDate(entry.queriedAt)}`,
    {
      x: MARGIN,
      y: 0.2,
      w: CONTENT_W,
      h: 0.3,
      fontSize: 10,
      color: COLOR.muted,
      align: 'right',
      fontFace: LATIN_FONT,
    },
  );

  // Word title (ruby)
  const wordRowWidth = Math.min(
    CONTENT_W,
    Math.max(1.5, entry.wordSyllables.length * 1.2),
  );
  const wordX = MARGIN + (CONTENT_W - wordRowWidth) / 2;
  let y = 0.55;
  y = addRuby(slide, entry.wordSyllables, {
    x: wordX,
    y,
    w: wordRowWidth,
    hanziSize: 44,
    pinyinSize: 16,
    showPinyin: opts.includePinyin,
    maxCharsPerRow: 8,
  });
  y += 0.15;

  // Horizontal rule
  slide.addShape('line' as unknown as PptxGenJS.ShapeType, {
    x: MARGIN,
    y,
    w: CONTENT_W,
    h: 0,
    line: { color: COLOR.rule, width: 0.75 },
  });
  y += 0.15;

  // Meanings
  const circled = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
  const meaningBlockH = (SLIDE_H - y - 0.4) / Math.max(1, entry.meanings.length);

  entry.meanings.forEach((m, idx) => {
    const blockTop = y;

    // numbered header: "① [POS]  读音: pinyin"
    const headerParts: PptxGenJS.TextProps[] = [
      {
        text: circled[idx] ?? `${idx + 1}.`,
        options: {
          fontSize: 16,
          bold: true,
          color: COLOR.accent,
          fontFace: LATIN_FONT,
        },
      },
      {
        text: `  [${m.partOfSpeech}]  `,
        options: { fontSize: 11, color: COLOR.muted, fontFace: LATIN_FONT, italic: true },
      },
    ];
    if (m.pinyin) {
      headerParts.push({
        text: `读音 ${m.pinyin}`,
        options: { fontSize: 11, color: COLOR.pinyin, fontFace: LATIN_FONT, italic: true },
      });
    }
    slide.addText(headerParts, {
      x: MARGIN,
      y: blockTop,
      w: CONTENT_W,
      h: 0.3,
      fontSize: 12,
      valign: 'middle',
    });

    // definition text (target language)
    slide.addText(m.definition, {
      x: MARGIN + 0.3,
      y: blockTop + 0.32,
      w: CONTENT_W - 0.3,
      h: 0.4,
      fontSize: 13,
      fontFace: LATIN_FONT,
      color: COLOR.heading,
      valign: 'top',
    });

    // example (ruby) + translation
    const exStart = blockTop + 0.75;
    const exY = addRuby(slide, m.example.chinese, {
      x: MARGIN + 0.3,
      y: exStart,
      w: CONTENT_W - 0.3,
      hanziSize: 16,
      pinyinSize: 9,
      showPinyin: opts.includePinyin,
      maxCharsPerRow: 16,
    });
    if (opts.includeExampleTranslation) {
      slide.addText(m.example.translation, {
        x: MARGIN + 0.3,
        y: exY + 0.05,
        w: CONTENT_W - 0.3,
        h: 0.4,
        fontSize: 11,
        fontFace: LATIN_FONT,
        color: COLOR.muted,
        italic: true,
      });
    }

    y = blockTop + meaningBlockH;
  });

  // Footer
  slide.addText('note.neooccidental.com', {
    x: MARGIN,
    y: SLIDE_H - 0.3,
    w: CONTENT_W,
    h: 0.25,
    fontSize: 8,
    color: COLOR.muted,
    align: 'center',
    fontFace: LATIN_FONT,
  });
}

export async function exportToPptx(
  sessions: ClassSession[],
  entries: DictionaryEntry[],
  opts: ExportOptions,
): Promise<void> {
  if (!entries.length) throw new Error('没有可导出的词条');

  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 — wait we use 10 x 5.625
  pres.defineLayout({ name: 'NOTE_DICT', width: SLIDE_W, height: SLIDE_H });
  pres.layout = 'NOTE_DICT';

  const title =
    opts.title?.trim() ||
    (sessions.length === 1 ? sessions[0].name : '课堂中文速查');

  buildCoverSlide(pres, sessions, entries, title);
  entries.forEach((entry) => buildEntrySlide(pres, entry, opts));

  const filename = `${title.replace(/[\\/:*?"<>|]/g, '_')}-${formatDate(Date.now())}.pptx`;
  await pres.writeFile({ fileName: filename });
}
