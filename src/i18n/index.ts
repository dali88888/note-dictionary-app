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
    reverseSearchPlaceholder: '输入任意语言（如 happy / je suis fatigué / ありがとう / "I want 一杯 coffee"）',
    searchBtn: '查询',
    searchLoading: '查询中…',
    searchHint: '回车查询 · 查询记录自动保存',

    /* Direction toggle */
    dirZhToOther: '中文 → 外语',
    dirOtherToZh: '外语 → 中文',
    dirZhToOtherShort: '中→外',
    dirOtherToZhShort: '外→中',
    targetIsChinese: '→ 中文',
    detectedLanguage: (v: Vars) => `检测语言：${v.lang}`,

    queryFailed: (v: Vars) => `查询失败：${v.msg}`,
    emptyHint: '在上方输入中文词开始查询。所有查询会自动按日期归档，课后可导出为 PPT。',
    emptyHintReverse: '在上方输入任意语言的词或句子，系统会给出地道的中文表达。',

    translatedToLine: (v: Vars) => `翻译至 ${v.lang} · ${v.n} 个义项`,
    chineseCandidatesLine: (v: Vars) => `从 ${v.lang} 译为中文 · ${v.n} 个候选词`,
    chineseCandidatesLineSingle: (v: Vars) => `从 ${v.lang} 译为中文`,
    usageNote: '用法说明',
    pronunciation: '读音：',
    example: '例句',
    deleteRecord: '删除此记录',

    /* Register labels (other→zh) */
    registerCasual: '口语',
    registerColloquial: '通俗',
    registerNeutral: '中性',
    registerFormal: '正式',
    registerLiterary: '书面',
    /* Direction badges shown in history */
    dirBadgeZhToOther: '中→外',
    dirBadgeOtherToZh: '外→中',

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

    /* Auth — login/signup screen */
    loginTab: '登录',
    signupTab: '注册',
    emailLabel: '邮箱',
    passwordLabel: '密码',
    displayNameLabel: '昵称',
    roleLabel: '我是',
    roleStudent: '学生',
    roleStudentHint: '记录自己的查询历史',
    roleTeacher: '教师',
    roleTeacherHint: '可为多名学生分别建档',
    signInBtn: '登录',
    signingIn: '登录中…',
    signUpBtn: '注册',
    signingUp: '注册中…',
    orDivider: '或',
    signInWithGoogle: '用 Google 登录',
    signInWithGitHub: '用 GitHub 登录',
    confirmEmailHeading: '请查收邮箱',
    confirmEmailBody: (v: Vars) =>
      `我们向 ${v.email} 发送了确认链接，点击后即可登录。`,

    /* Password strength rules */
    pwRuleLen: '至少 8 位',
    pwRuleLower: '包含小写字母',
    pwRuleUpper: '包含大写字母',
    pwRuleDigit: '包含数字',
    pwRuleSpecial: '包含特殊字符',

    /* Config-error fallback */
    authConfigMissingTitle: '认证服务未配置',
    authConfigMissingBody:
      '请在 .env.local 中填入 Supabase 凭据（URL + publishable key）后重新加载。',

    /* Top-bar user menu */
    signOutBtn: '退出登录',
    roleBadgeStudent: '学生',
    roleBadgeTeacher: '教师',
    helloUser: (v: Vars) => `你好，${v.name}`,

    /* Managed-student switcher (teacher only) */
    contextLabel: '当前',
    contextSelf: '我自己',
    contextStudent: (v: Vars) => `学生：${v.name}`,
    manageStudentsBtn: '管理学生子文件夹',
    studentManagerTitle: '学生子文件夹',
    studentManagerHint:
      '为每个学生建立独立的查询空间。在某学生上下文中查询的所有词条只会归属于该学生，便于课后单独导出与复习。',
    studentEmpty: '还没有学生子文件夹。',
    addStudentLabel: '新增学生',
    addStudentPlaceholder: '学生姓名',
    addStudentBtn: '添加',
    studentRowEdit: '重命名',
    studentRowDelete: '删除',
    studentRowSave: '保存',
    studentRowCancel: '取消',
    studentDeleteConfirm: (v: Vars) =>
      `删除学生"${v.name}"？该学生名下的所有词条与课程都会一并删除。`,
    closeBtn: '关闭',

    /* Legacy localStorage import dialog */
    importLegacyTitle: '导入本设备上的旧数据？',
    importLegacyBody: (v: Vars) =>
      `检测到此设备本地保存了 ${v.entries} 条词条与 ${v.sessions} 组课程（来自您注册账号之前的查询）。是否一次性导入到您的云端账户，便于在其他设备上访问？`,
    importLegacyConfirm: '导入到云端',
    importLegacySkip: '暂不导入',
    importLegacyImporting: '导入中…',
    importLegacyDone: (v: Vars) =>
      `已导入 ${v.entries} 条词条 / ${v.sessions} 组课程。`,
    importLegacyFailed: (v: Vars) => `导入失败：${v.msg}`,
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
    reverseSearchPlaceholder:
      'Enter any language (e.g. happy / je suis fatigué / ありがとう / "I want 一杯 coffee")',
    searchBtn: 'Search',
    searchLoading: 'Searching…',
    searchHint: 'Press Enter to search · auto-saved to history',

    /* Direction toggle */
    dirZhToOther: 'Chinese → Other',
    dirOtherToZh: 'Other → Chinese',
    dirZhToOtherShort: 'ZH→',
    dirOtherToZhShort: '→ZH',
    targetIsChinese: '→ Chinese',
    detectedLanguage: (v: Vars) => `Detected: ${v.lang}`,

    queryFailed: (v: Vars) => `Query failed: ${v.msg}`,
    emptyHint:
      'Enter a Chinese word above to start. Queries are auto-archived by date and can be exported as PPT after class.',
    emptyHintReverse:
      'Enter a word or sentence in any language and get idiomatic Chinese expressions.',

    translatedToLine: (v: Vars) =>
      `Translated to ${v.lang} · ${v.n} meaning${Number(v.n) === 1 ? '' : 's'}`,
    chineseCandidatesLine: (v: Vars) =>
      `${v.lang} → Chinese · ${v.n} candidate${Number(v.n) === 1 ? '' : 's'}`,
    chineseCandidatesLineSingle: (v: Vars) => `${v.lang} → Chinese`,
    usageNote: 'When to use',
    pronunciation: 'Pron.: ',
    example: 'Example',
    deleteRecord: 'Delete this record',

    /* Register labels (other→zh) */
    registerCasual: 'casual',
    registerColloquial: 'colloquial',
    registerNeutral: 'neutral',
    registerFormal: 'formal',
    registerLiterary: 'literary',
    /* Direction badges shown in history */
    dirBadgeZhToOther: 'ZH→',
    dirBadgeOtherToZh: '→ZH',

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

    /* Auth — login/signup screen */
    loginTab: 'Sign in',
    signupTab: 'Sign up',
    emailLabel: 'Email',
    passwordLabel: 'Password',
    displayNameLabel: 'Display name',
    roleLabel: 'I am a',
    roleStudent: 'Student',
    roleStudentHint: 'Track my own lookups',
    roleTeacher: 'Teacher',
    roleTeacherHint: 'Manage folders for my students',
    signInBtn: 'Sign in',
    signingIn: 'Signing in…',
    signUpBtn: 'Create account',
    signingUp: 'Creating account…',
    orDivider: 'or',
    signInWithGoogle: 'Sign in with Google',
    signInWithGitHub: 'Sign in with GitHub',
    confirmEmailHeading: 'Check your inbox',
    confirmEmailBody: (v: Vars) =>
      `We sent a confirmation link to ${v.email}. Click it to finish signing up.`,

    /* Password strength rules */
    pwRuleLen: 'At least 8 characters',
    pwRuleLower: 'A lowercase letter',
    pwRuleUpper: 'An uppercase letter',
    pwRuleDigit: 'A digit',
    pwRuleSpecial: 'A special character',

    /* Config-error fallback */
    authConfigMissingTitle: 'Auth not configured',
    authConfigMissingBody:
      'Set the Supabase URL + publishable key in .env.local and reload.',

    /* Top-bar user menu */
    signOutBtn: 'Sign out',
    roleBadgeStudent: 'Student',
    roleBadgeTeacher: 'Teacher',
    helloUser: (v: Vars) => `Hi, ${v.name}`,

    /* Managed-student switcher (teacher only) */
    contextLabel: 'Context',
    contextSelf: 'Myself',
    contextStudent: (v: Vars) => `Student: ${v.name}`,
    manageStudentsBtn: 'Manage student folders',
    studentManagerTitle: 'Student folders',
    studentManagerHint:
      'Each student gets a private lookup folder. Queries you make while a student is selected belong to that student only — handy for per-student exports and review.',
    studentEmpty: 'No student folders yet.',
    addStudentLabel: 'Add student',
    addStudentPlaceholder: 'Student name',
    addStudentBtn: 'Add',
    studentRowEdit: 'Rename',
    studentRowDelete: 'Delete',
    studentRowSave: 'Save',
    studentRowCancel: 'Cancel',
    studentDeleteConfirm: (v: Vars) =>
      `Delete student "${v.name}"? All entries and class sessions belonging to this student will also be deleted.`,
    closeBtn: 'Close',

    /* Legacy localStorage import dialog */
    importLegacyTitle: 'Import data from this device?',
    importLegacyBody: (v: Vars) =>
      `We found ${v.entries} entries and ${v.sessions} class sessions saved locally on this device (from before you signed up). Import them into your cloud account so they're available on other devices?`,
    importLegacyConfirm: 'Import to cloud',
    importLegacySkip: 'Skip',
    importLegacyImporting: 'Importing…',
    importLegacyDone: (v: Vars) =>
      `Imported ${v.entries} ${Number(v.entries) === 1 ? 'entry' : 'entries'} / ${v.sessions} session${Number(v.sessions) === 1 ? '' : 's'}.`,
    importLegacyFailed: (v: Vars) => `Import failed: ${v.msg}`,
  },
} as const satisfies Record<UILang, Record<string, string | ((v: Vars) => string)>>;

export type StringKey = keyof (typeof DICT)['zh'];

export function translate(lang: UILang, key: StringKey, vars?: Vars): string {
  const entry = DICT[lang][key] ?? DICT.zh[key];
  return typeof entry === 'function' ? entry(vars ?? {}) : entry;
}
