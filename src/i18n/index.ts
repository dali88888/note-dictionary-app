/**
 * UI language (chrome) strings. Independent of the user's "translate target"
 * selection — the UI language is for labels like "查询", "例句", "删除" etc.
 * Default is Chinese. Add more locales by extending UI_LANGS + each dict.
 */

export const UI_LANGS = ['zh', 'en'] as const;
export type UILang = (typeof UI_LANGS)[number];

export const UI_LANG_LABEL: Record<UILang, string> = {
  zh: '中文',
  en: 'English',
};

type Vars = Record<string, string | number>;

/** The dictionary of UI strings. Every key must exist in every locale. */
const DICT = {
  zh: {
    appTitle: '课堂中文速查',
    tabSearch: '查词',
    tabHistory: '历史 & 导出',

    pinyin: '拼音',
    uiLangLabel: '界面',
    translateTo: '翻译至',
    otherLang: '其他…',
    otherLangWith: (v: Vars) => `其他：${v.value}`,

    customLangTitle: '自定义目标语言',
    customLangHint: '输入任意语言名称（如 "Tiếng Việt"、"Português"、"हिन्दी"）。',
    customLangPlaceholder: '语言名称',
    cancel: '取消',
    confirm: '确定',

    startNewClass: '+ 开始新课程',
    endClass: '结束课程',
    currentClass: '当前课程',
    wordsUnit: (v: Vars) => `· ${v.n} 词`,
    classNamePlaceholder: '课程名，如: 商务汉语 3',
    start: '开始',

    searchPlaceholder: '输入中文词，如：长、打、一带一路',
    searchBtn: '查询',
    searchLoading: '查询中…',
    searchHint: '回车查询 · 查询记录自动保存',

    queryFailed: (v: Vars) => `查询失败：${v.msg}`,
    emptyHint: '在上方输入中文词开始查询。所有查询会自动按日期归档，课后可导出为 PPT。',

    translatedToLine: (v: Vars) => `翻译至 ${v.lang} · ${v.n} 个义项`,
    pronunciation: '读音：',
    example: '例句',
    deleteRecord: '删除此记录',

    tabAll: '全部查询',
    tabByDate: '按日期',
    tabByClass: '按课程',

    emptyAll: '还没有查询记录。去"查词"页输入一个中文词开始吧。',
    emptyByDate: '今天还没有自动归档的查询。',
    emptyByClass: '还没有手动创建的课程。在顶部点击"开始新课程"即可创建。',

    autoArchive: '自动归档',
    manualClass: '手动课程',
    ended: '已结束',
    startedAt: (v: Vars) => `开始 ${v.time}`,
    endedAt: (v: Vars) => ` · 结束 ${v.time}`,
    deleteSessionConfirm: (v: Vars) => `删除 session "${v.name}"？词条不会被删除。`,
    delete: '删除',
    moreN: (v: Vars) => `+${v.n} 更多`,

    allEntriesSub: (v: Vars) => `${v.lang} · ${v.time} · ${v.n} 义项`,

    exportPptTitle: '导出为 PPT',
    exportHint: '在左侧"按日期"或"按课程"中勾选想导出的 session，然后点击下方按钮。',
    selectedSessions: (v: Vars) => `已选 ${v.n} 组 session`,
    dedupedEntries: (v: Vars) => `共 ${v.n} 个去重后的词条`,
    includePinyin: '例句含拼音',
    includeExampleTranslation: '例句含翻译',
    pptTitleLabel: 'PPT 标题（可选）',
    pptTitlePlaceholder: '留空则用课程名',
    exportBtn: '导出 .pptx',
    exporting: '生成中…',
    clearSelection: '清空选择',
    exportFailed: (v: Vars) => `导出失败：${v.msg}`,

    nothingToExport: '没有可导出的词条',
    pptFooterBrand: 'note.neooccidental.com · 课堂中文速查',
    pptEntriesCount: (v: Vars) => `共 ${v.n} 个词条`,
    pptGroupCount: (v: Vars) => `${v.n} 组课程 / 日期`,
  },
  en: {
    appTitle: 'Classroom Chinese Lookup',
    tabSearch: 'Lookup',
    tabHistory: 'History & Export',

    pinyin: 'Pinyin',
    uiLangLabel: 'UI',
    translateTo: 'Translate to',
    otherLang: 'Other…',
    otherLangWith: (v: Vars) => `Other: ${v.value}`,

    customLangTitle: 'Custom target language',
    customLangHint: 'Enter any language name (e.g. "Tiếng Việt", "Português", "हिन्दी").',
    customLangPlaceholder: 'Language name',
    cancel: 'Cancel',
    confirm: 'OK',

    startNewClass: '+ New class',
    endClass: 'End class',
    currentClass: 'Class',
    wordsUnit: (v: Vars) => `· ${v.n} word${Number(v.n) === 1 ? '' : 's'}`,
    classNamePlaceholder: 'Class name, e.g. Business Chinese 3',
    start: 'Start',

    searchPlaceholder: 'Enter a Chinese word (e.g. 长, 打, 一带一路)',
    searchBtn: 'Search',
    searchLoading: 'Searching…',
    searchHint: 'Press Enter to search · auto-saved to history',

    queryFailed: (v: Vars) => `Query failed: ${v.msg}`,
    emptyHint:
      'Enter a Chinese word above to start. Queries are auto-archived by date and can be exported as PPT after class.',

    translatedToLine: (v: Vars) =>
      `Translated to ${v.lang} · ${v.n} meaning${Number(v.n) === 1 ? '' : 's'}`,
    pronunciation: 'Pron.: ',
    example: 'Example',
    deleteRecord: 'Delete this record',

    tabAll: 'All',
    tabByDate: 'By date',
    tabByClass: 'By class',

    emptyAll: 'No queries yet. Go to "Lookup" and enter a Chinese word to start.',
    emptyByDate: 'No auto-archived queries yet today.',
    emptyByClass: 'No manual classes yet. Click "New class" in the top bar to create one.',

    autoArchive: 'Auto',
    manualClass: 'Manual',
    ended: 'Ended',
    startedAt: (v: Vars) => `Started ${v.time}`,
    endedAt: (v: Vars) => ` · ended ${v.time}`,
    deleteSessionConfirm: (v: Vars) =>
      `Delete session "${v.name}"? Entries will not be deleted.`,
    delete: 'Delete',
    moreN: (v: Vars) => `+${v.n} more`,

    allEntriesSub: (v: Vars) =>
      `${v.lang} · ${v.time} · ${v.n} meaning${Number(v.n) === 1 ? '' : 's'}`,

    exportPptTitle: 'Export as PPT',
    exportHint:
      'Pick one or more sessions in "By date" or "By class" on the left, then click below.',
    selectedSessions: (v: Vars) =>
      `${v.n} session${Number(v.n) === 1 ? '' : 's'} selected`,
    dedupedEntries: (v: Vars) =>
      `${v.n} unique ${Number(v.n) === 1 ? 'entry' : 'entries'} total`,
    includePinyin: 'Pinyin on examples',
    includeExampleTranslation: 'Translate examples',
    pptTitleLabel: 'PPT title (optional)',
    pptTitlePlaceholder: 'Leave empty to use class name',
    exportBtn: 'Export .pptx',
    exporting: 'Generating…',
    clearSelection: 'Clear selection',
    exportFailed: (v: Vars) => `Export failed: ${v.msg}`,

    nothingToExport: 'No entries to export',
    pptFooterBrand: 'note.neooccidental.com · Classroom Chinese Lookup',
    pptEntriesCount: (v: Vars) =>
      `${v.n} ${Number(v.n) === 1 ? 'entry' : 'entries'}`,
    pptGroupCount: (v: Vars) =>
      `${v.n} class${Number(v.n) === 1 ? '' : 'es'} / date${Number(v.n) === 1 ? '' : 's'}`,
  },
} as const satisfies Record<UILang, Record<string, string | ((v: Vars) => string)>>;

export type StringKey = keyof (typeof DICT)['zh'];

export function translate(lang: UILang, key: StringKey, vars?: Vars): string {
  const entry = DICT[lang][key] ?? DICT.zh[key];
  return typeof entry === 'function' ? entry(vars ?? {}) : entry;
}
