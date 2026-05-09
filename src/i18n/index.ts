/**
 * UI language (chrome) strings.  Independent of the user's "translate
 * target" selection — the UI language drives labels like "Search",
 * "Example", "Delete" etc.
 *
 * Default is English.  To add a new locale: append its code to
 * UI_LANGS, give it a display name in UI_LANG_LABEL, and provide a
 * full translation block in DICT.  TypeScript will complain at build
 * time about any missing keys via the `satisfies` clause below.
 */

export const UI_LANGS = [
  'en', 'zh', 'es', 'de', 'fr', 'ja', 'ko', 'ru', 'ar',
] as const;
export type UILang = (typeof UI_LANGS)[number];

/** Each locale's name in its OWN language (so the dropdown is
 *  intelligible regardless of which one is currently active). */
export const UI_LANG_LABEL: Record<UILang, string> = {
  en: 'English',
  zh: '中文',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
  ar: 'العربية',
};

/** RTL locales — App.tsx uses this to set `document.documentElement.dir`. */
export const RTL_LANGS: ReadonlyArray<UILang> = ['ar'];

type Vars = Record<string, string | number>;

/** The dictionary of UI strings.  Every key MUST exist in every locale.
 *  TypeScript enforces this via the `satisfies` clause at the bottom. */
const DICT = {
  /* ─────────────────────────── English ─────────────────────────── */
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

    searchPlaceholder: 'Enter a Chinese word or sentence (e.g. 长 / 一带一路 / 我想去中国旅行。)',
    reverseSearchPlaceholder:
      'Enter a word or sentence in any language (e.g. happy / je suis fatigué / "I want to travel to China")',
    searchBtn: 'Search',
    searchLoading: 'Searching…',
    searchHint: 'Enter to search · Shift+Enter for newline · sentences get a translation only, no example',

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
    sentenceTranslatedTo: (v: Vars) => `Sentence translation · ${v.lang}`,
    cacheHitBadge: 'Cached',
    cacheHitTooltip:
      'This entry is already in your library; reused instantly with no AI quota spent.',
    chineseCandidatesLine: (v: Vars) =>
      `${v.lang} → Chinese · ${v.n} candidate${Number(v.n) === 1 ? '' : 's'}`,
    chineseCandidatesLineSingle: (v: Vars) => `${v.lang} → Chinese`,
    usageNote: 'When to use',
    pronunciation: 'Pron.: ',
    example: 'Example',
    deleteRecord: 'Delete this record',
    refreshTooltip: 'Re-query (skip cache)',
    previewEntryHint: 'Click to view full definition',

    registerCasual: 'casual',
    registerColloquial: 'colloquial',
    registerNeutral: 'neutral',
    registerFormal: 'formal',
    registerLiterary: 'literary',
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
    confirmEmailHint:
      'Didn’t get it? Check your spam folder, or use "Resend email" below.',
    confirmEmailAlreadyHeading: 'This email is already registered',
    confirmEmailAlreadyBody: (v: Vars) =>
      `${v.email} was registered before but never confirmed. Supabase won’t auto-send another email — tap below to resend, or sign in if you already confirmed.`,
    confirmEmailResend: 'Resend confirmation email',
    confirmEmailResending: 'Sending…',
    confirmEmailResent: 'Email sent again — please check your inbox.',
    confirmEmailResendFailed: (v: Vars) => `Resend failed: ${v.msg}`,
    confirmEmailGoLogin: 'Go to sign-in',

    pwRuleLen: 'At least 8 characters',
    pwRuleLower: 'A lowercase letter',
    pwRuleUpper: 'An uppercase letter',
    pwRuleDigit: 'A digit',
    pwRuleSpecial: 'A special character',

    authConfigMissingTitle: 'Auth not configured',
    authConfigMissingBody:
      'Set the Supabase URL + publishable key in .env.local and reload.',
    reloadPage: 'Reload page & retry',

    signOutBtn: 'Sign out',
    roleBadgeStudent: 'Student',
    roleBadgeTeacher: 'Teacher',
    helloUser: (v: Vars) => `Hi, ${v.name}`,

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

    importLegacyTitle: 'Import data from this device?',
    importLegacyBody: (v: Vars) =>
      `We found ${v.entries} entries and ${v.sessions} class sessions saved locally on this device (from before you signed up). Import them into your cloud account so they're available on other devices?`,
    importLegacyConfirm: 'Import to cloud',
    importLegacySkip: 'Skip',
    importLegacyImporting: 'Importing…',
    importLegacyDone: (v: Vars) =>
      `Imported ${v.entries} ${Number(v.entries) === 1 ? 'entry' : 'entries'} / ${v.sessions} session${Number(v.sessions) === 1 ? '' : 's'}.`,
    importLegacyFailed: (v: Vars) => `Import failed: ${v.msg}`,

    signupPromptTitle: 'Sign up to build your Chinese knowledge base',
    signupPromptBody:
      'You can look up words right now — no sign-in required. Register to unlock:',
    signupPromptBullet1: 'Cloud-saved queries, available on every device',
    signupPromptBullet2: 'Auto archive by date / class, review and export to PPT anytime',
    signupPromptBullet3: 'Coming soon: auto-generated quizzes & spaced review',
    signupPromptBullet4: 'Sign up as a teacher to manage separate folders for each student',
    signupPromptCtaSignup: 'Sign up — free',
    signupPromptCtaLogin: 'Already have an account? Sign in',
    signupPromptDismiss: 'Dismiss',

    historyAnonTitle: 'History requires an account',
    historyAnonBody:
      'Anonymous queries are not saved to the cloud. Sign up and every lookup is auto-archived by date and class, ready for review or PPT export.',
  },

  /* ─────────────────────────── Chinese ─────────────────────────── */
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

    searchPlaceholder: '输入中文词或整句，如：长 / 一带一路 / 我想去中国旅行。',
    reverseSearchPlaceholder: '输入任意语言的词或整句，如 happy / je suis fatigué / "I want to travel to China"',
    searchBtn: '查询',
    searchLoading: '查询中…',
    searchHint: '回车查询 · Shift + 回车换行 · 输入整句时只翻译，不再给例句',

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
    sentenceTranslatedTo: (v: Vars) => `整句翻译 · ${v.lang}`,
    cacheHitBadge: '已缓存',
    cacheHitTooltip:
      '该词条已在你的词库里，本次直接复用——未消耗 AI 配额、即刻返回。',
    chineseCandidatesLine: (v: Vars) => `从 ${v.lang} 译为中文 · ${v.n} 个候选词`,
    chineseCandidatesLineSingle: (v: Vars) => `从 ${v.lang} 译为中文`,
    usageNote: '用法说明',
    pronunciation: '读音：',
    example: '例句',
    deleteRecord: '删除此记录',
    refreshTooltip: '重新查询（跳过缓存）',
    previewEntryHint: '点击查看完整释义',

    registerCasual: '口语',
    registerColloquial: '通俗',
    registerNeutral: '中性',
    registerFormal: '正式',
    registerLiterary: '书面',
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
    confirmEmailHint:
      '没有收到？请检查垃圾邮件文件夹，或点击下方"重发邮件"。',
    confirmEmailAlreadyHeading: '该邮箱已注册过',
    confirmEmailAlreadyBody: (v: Vars) =>
      `${v.email} 之前已注册但尚未确认。Supabase 不会重复发送邮件，请点击下方按钮重发，或如果你已确认过则直接登录。`,
    confirmEmailResend: '重发确认邮件',
    confirmEmailResending: '发送中…',
    confirmEmailResent: '邮件已重新发送，请查收。',
    confirmEmailResendFailed: (v: Vars) => `重发失败：${v.msg}`,
    confirmEmailGoLogin: '直接登录',

    pwRuleLen: '至少 8 位',
    pwRuleLower: '包含小写字母',
    pwRuleUpper: '包含大写字母',
    pwRuleDigit: '包含数字',
    pwRuleSpecial: '包含特殊字符',

    authConfigMissingTitle: '认证服务未配置',
    authConfigMissingBody:
      '请在 .env.local 中填入 Supabase 凭据（URL + publishable key）后重新加载。',
    reloadPage: '刷新页面重试',

    signOutBtn: '退出登录',
    roleBadgeStudent: '学生',
    roleBadgeTeacher: '教师',
    helloUser: (v: Vars) => `你好，${v.name}`,

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

    importLegacyTitle: '导入本设备上的旧数据？',
    importLegacyBody: (v: Vars) =>
      `检测到此设备本地保存了 ${v.entries} 条词条与 ${v.sessions} 组课程（来自您注册账号之前的查询）。是否一次性导入到您的云端账户，便于在其他设备上访问？`,
    importLegacyConfirm: '导入到云端',
    importLegacySkip: '暂不导入',
    importLegacyImporting: '导入中…',
    importLegacyDone: (v: Vars) =>
      `已导入 ${v.entries} 条词条 / ${v.sessions} 组课程。`,
    importLegacyFailed: (v: Vars) => `导入失败：${v.msg}`,

    signupPromptTitle: '注册账号，构建你的中文知识库',
    signupPromptBody:
      '你现在可以直接查词、查例句——免登录，立即可用。注册后还能解锁这些：',
    signupPromptBullet1: '所有查询自动云端保存，跨设备访问',
    signupPromptBullet2: '按日期 / 课程归档，随时复习与导出 PPT',
    signupPromptBullet3: '后续将支持自动出题、错题本等复习功能',
    signupPromptBullet4: '注册为教师后，可为多名学生分别建立独立词库',
    signupPromptCtaSignup: '免费注册',
    signupPromptCtaLogin: '已有账号？登录',
    signupPromptDismiss: '关闭',

    historyAnonTitle: '历史记录需要登录',
    historyAnonBody:
      '匿名查询不会保存到云端。注册后，你的所有查询会自动按日期与课程归档，方便日后复习和导出 PPT。',
  },

  /* ─────────────────────────── Spanish ─────────────────────────── */
  es: {
    appTitle: 'Diccionario de chino para clase',
    tabSearch: 'Buscar',
    tabHistory: 'Historial y exportación',

    pinyin: 'Pinyin',
    uiLangLabel: 'Idioma',
    translateTo: 'Traducir a',
    otherLang: 'Otro…',
    otherLangWith: (v: Vars) => `Otro: ${v.value}`,

    customLangTitle: 'Idioma de destino personalizado',
    customLangHint: 'Escribe cualquier nombre de idioma (p. ej. "Tiếng Việt", "Português", "हिन्दी").',
    customLangPlaceholder: 'Nombre del idioma',
    cancel: 'Cancelar',
    confirm: 'Aceptar',

    startNewClass: '+ Nueva clase',
    endClass: 'Terminar clase',
    currentClass: 'Clase',
    wordsUnit: (v: Vars) => `· ${v.n} palabra${Number(v.n) === 1 ? '' : 's'}`,
    classNamePlaceholder: 'Nombre de la clase, p. ej. Chino comercial 3',
    start: 'Empezar',

    searchPlaceholder: 'Introduce una palabra o frase en chino (p. ej. 长 / 一带一路 / 我想去中国旅行。)',
    reverseSearchPlaceholder:
      'Introduce una palabra o frase en cualquier idioma (p. ej. happy / je suis fatigué / "Quiero viajar a China")',
    searchBtn: 'Buscar',
    searchLoading: 'Buscando…',
    searchHint: 'Intro para buscar · Mayús+Intro para nueva línea · las frases solo reciben traducción, sin ejemplos',

    dirZhToOther: 'Chino → Otro',
    dirOtherToZh: 'Otro → Chino',
    dirZhToOtherShort: 'ZH→',
    dirOtherToZhShort: '→ZH',
    targetIsChinese: '→ Chino',
    detectedLanguage: (v: Vars) => `Detectado: ${v.lang}`,

    queryFailed: (v: Vars) => `Búsqueda fallida: ${v.msg}`,
    emptyHint:
      'Introduce una palabra china arriba para empezar. Las búsquedas se archivan por fecha y se pueden exportar a PPT.',
    emptyHintReverse:
      'Introduce una palabra o frase en cualquier idioma y obtén expresiones idiomáticas en chino.',

    translatedToLine: (v: Vars) =>
      `Traducido a ${v.lang} · ${v.n} acepción${Number(v.n) === 1 ? '' : 'es'}`,
    sentenceTranslatedTo: (v: Vars) => `Traducción de frase · ${v.lang}`,
    cacheHitBadge: 'En caché',
    cacheHitTooltip:
      'Esta entrada ya está en tu biblioteca; reutilizada al instante sin gastar cuota de IA.',
    chineseCandidatesLine: (v: Vars) =>
      `${v.lang} → Chino · ${v.n} candidato${Number(v.n) === 1 ? '' : 's'}`,
    chineseCandidatesLineSingle: (v: Vars) => `${v.lang} → Chino`,
    usageNote: 'Cuándo usarlo',
    pronunciation: 'Pron.: ',
    example: 'Ejemplo',
    deleteRecord: 'Eliminar este registro',
    refreshTooltip: 'Volver a consultar (omitir caché)',
    previewEntryHint: 'Haz clic para ver la definición completa',

    registerCasual: 'casual',
    registerColloquial: 'coloquial',
    registerNeutral: 'neutro',
    registerFormal: 'formal',
    registerLiterary: 'literario',
    dirBadgeZhToOther: 'ZH→',
    dirBadgeOtherToZh: '→ZH',

    tabAll: 'Todas',
    tabByDate: 'Por fecha',
    tabByClass: 'Por clase',

    emptyAll: 'Aún no hay búsquedas. Ve a "Buscar" e introduce una palabra china.',
    emptyByDate: 'Aún no hay búsquedas archivadas hoy.',
    emptyByClass: 'Aún no hay clases manuales. Pulsa "Nueva clase" arriba para crear una.',

    autoArchive: 'Auto',
    manualClass: 'Manual',
    ended: 'Terminada',
    startedAt: (v: Vars) => `Iniciada ${v.time}`,
    endedAt: (v: Vars) => ` · terminada ${v.time}`,
    deleteSessionConfirm: (v: Vars) =>
      `¿Eliminar la sesión "${v.name}"? Las entradas no se eliminarán.`,
    delete: 'Eliminar',
    moreN: (v: Vars) => `+${v.n} más`,

    allEntriesSub: (v: Vars) =>
      `${v.lang} · ${v.time} · ${v.n} acepción${Number(v.n) === 1 ? '' : 'es'}`,

    exportPptTitle: 'Exportar como PPT',
    exportHint:
      'Selecciona una o varias sesiones en "Por fecha" o "Por clase" a la izquierda y pulsa abajo.',
    selectedSessions: (v: Vars) =>
      `${v.n} sesion${Number(v.n) === 1 ? '' : 'es'} seleccionada${Number(v.n) === 1 ? '' : 's'}`,
    dedupedEntries: (v: Vars) =>
      `${v.n} entrada${Number(v.n) === 1 ? '' : 's'} única${Number(v.n) === 1 ? '' : 's'} en total`,
    includePinyin: 'Pinyin en los ejemplos',
    includeExampleTranslation: 'Traducir los ejemplos',
    pptTitleLabel: 'Título de PPT (opcional)',
    pptTitlePlaceholder: 'En blanco usa el nombre de la clase',
    exportBtn: 'Exportar .pptx',
    exporting: 'Generando…',
    clearSelection: 'Limpiar selección',
    exportFailed: (v: Vars) => `Exportación fallida: ${v.msg}`,

    nothingToExport: 'No hay entradas para exportar',
    pptFooterBrand: 'note.neooccidental.com · Diccionario de chino para clase',
    pptEntriesCount: (v: Vars) =>
      `${v.n} entrada${Number(v.n) === 1 ? '' : 's'}`,
    pptGroupCount: (v: Vars) =>
      `${v.n} clase${Number(v.n) === 1 ? '' : 's'} / fecha${Number(v.n) === 1 ? '' : 's'}`,

    loginTab: 'Iniciar sesión',
    signupTab: 'Registrarse',
    emailLabel: 'Correo electrónico',
    passwordLabel: 'Contraseña',
    displayNameLabel: 'Nombre',
    roleLabel: 'Soy',
    roleStudent: 'Estudiante',
    roleStudentHint: 'Llevar mis propias búsquedas',
    roleTeacher: 'Profesor/a',
    roleTeacherHint: 'Gestionar carpetas para mis estudiantes',
    signInBtn: 'Iniciar sesión',
    signingIn: 'Iniciando sesión…',
    signUpBtn: 'Crear cuenta',
    signingUp: 'Creando cuenta…',
    orDivider: 'o',
    signInWithGoogle: 'Iniciar sesión con Google',
    signInWithGitHub: 'Iniciar sesión con GitHub',
    confirmEmailHeading: 'Revisa tu correo',
    confirmEmailBody: (v: Vars) =>
      `Hemos enviado un enlace de confirmación a ${v.email}. Pulsa en él para terminar el registro.`,
    confirmEmailHint:
      '¿No te llegó? Revisa la carpeta de spam o usa "Reenviar correo" abajo.',
    confirmEmailAlreadyHeading: 'Este correo ya está registrado',
    confirmEmailAlreadyBody: (v: Vars) =>
      `${v.email} se registró antes pero nunca se confirmó. Supabase no enviará otro correo automáticamente — pulsa abajo para reenviar, o inicia sesión si ya lo confirmaste.`,
    confirmEmailResend: 'Reenviar correo de confirmación',
    confirmEmailResending: 'Enviando…',
    confirmEmailResent: 'Correo reenviado — revisa tu bandeja de entrada.',
    confirmEmailResendFailed: (v: Vars) => `Reenvío fallido: ${v.msg}`,
    confirmEmailGoLogin: 'Ir al inicio de sesión',

    pwRuleLen: 'Al menos 8 caracteres',
    pwRuleLower: 'Una letra minúscula',
    pwRuleUpper: 'Una letra mayúscula',
    pwRuleDigit: 'Un dígito',
    pwRuleSpecial: 'Un carácter especial',

    authConfigMissingTitle: 'Autenticación no configurada',
    authConfigMissingBody:
      'Configura la URL y la publishable key de Supabase en .env.local y recarga.',
    reloadPage: 'Recargar página y reintentar',

    signOutBtn: 'Cerrar sesión',
    roleBadgeStudent: 'Estudiante',
    roleBadgeTeacher: 'Profesor/a',
    helloUser: (v: Vars) => `Hola, ${v.name}`,

    contextLabel: 'Contexto',
    contextSelf: 'Yo',
    contextStudent: (v: Vars) => `Estudiante: ${v.name}`,
    manageStudentsBtn: 'Gestionar carpetas de estudiantes',
    studentManagerTitle: 'Carpetas de estudiantes',
    studentManagerHint:
      'Cada estudiante tiene una carpeta privada. Las búsquedas hechas con un estudiante seleccionado pertenecen solo a ese estudiante — útil para exportaciones y repasos individuales.',
    studentEmpty: 'Aún no hay carpetas de estudiantes.',
    addStudentLabel: 'Añadir estudiante',
    addStudentPlaceholder: 'Nombre del estudiante',
    addStudentBtn: 'Añadir',
    studentRowEdit: 'Renombrar',
    studentRowDelete: 'Eliminar',
    studentRowSave: 'Guardar',
    studentRowCancel: 'Cancelar',
    studentDeleteConfirm: (v: Vars) =>
      `¿Eliminar al estudiante "${v.name}"? Todas las entradas y sesiones de clase de este estudiante también se eliminarán.`,
    closeBtn: 'Cerrar',

    importLegacyTitle: '¿Importar datos de este dispositivo?',
    importLegacyBody: (v: Vars) =>
      `Encontramos ${v.entries} entradas y ${v.sessions} sesiones guardadas localmente en este dispositivo (de antes de registrarte). ¿Quieres importarlas a tu cuenta en la nube para acceder a ellas en otros dispositivos?`,
    importLegacyConfirm: 'Importar a la nube',
    importLegacySkip: 'Omitir',
    importLegacyImporting: 'Importando…',
    importLegacyDone: (v: Vars) =>
      `Importadas ${v.entries} entrada${Number(v.entries) === 1 ? '' : 's'} / ${v.sessions} sesion${Number(v.sessions) === 1 ? '' : 'es'}.`,
    importLegacyFailed: (v: Vars) => `Importación fallida: ${v.msg}`,

    signupPromptTitle: 'Regístrate y construye tu base de conocimiento de chino',
    signupPromptBody:
      'Puedes buscar palabras ahora mismo, sin registrarte. Regístrate para desbloquear:',
    signupPromptBullet1: 'Búsquedas guardadas en la nube, disponibles en cualquier dispositivo',
    signupPromptBullet2: 'Archivado automático por fecha / clase, repaso y exportación a PPT cuando quieras',
    signupPromptBullet3: 'Próximamente: cuestionarios automáticos y repaso espaciado',
    signupPromptBullet4: 'Regístrate como profesor/a y gestiona carpetas separadas para cada estudiante',
    signupPromptCtaSignup: 'Registrarse — gratis',
    signupPromptCtaLogin: '¿Ya tienes cuenta? Inicia sesión',
    signupPromptDismiss: 'Descartar',

    historyAnonTitle: 'El historial requiere una cuenta',
    historyAnonBody:
      'Las búsquedas anónimas no se guardan en la nube. Regístrate y cada búsqueda se archivará por fecha y clase, lista para repasar o exportar a PPT.',
  },

  /* ─────────────────────────── German ─────────────────────────── */
  de: {
    appTitle: 'Chinesisch-Schnellnachschlag für den Unterricht',
    tabSearch: 'Suchen',
    tabHistory: 'Verlauf & Export',

    pinyin: 'Pinyin',
    uiLangLabel: 'Sprache',
    translateTo: 'Übersetzen ins',
    otherLang: 'Andere…',
    otherLangWith: (v: Vars) => `Andere: ${v.value}`,

    customLangTitle: 'Eigene Zielsprache',
    customLangHint: 'Beliebigen Sprachnamen eingeben (z. B. "Tiếng Việt", "Português", "हिन्दी").',
    customLangPlaceholder: 'Sprachname',
    cancel: 'Abbrechen',
    confirm: 'OK',

    startNewClass: '+ Neue Stunde',
    endClass: 'Stunde beenden',
    currentClass: 'Stunde',
    wordsUnit: (v: Vars) => `· ${v.n} ${Number(v.n) === 1 ? 'Wort' : 'Wörter'}`,
    classNamePlaceholder: 'Stundenname, z. B. Wirtschaftschinesisch 3',
    start: 'Start',

    searchPlaceholder: 'Chinesisches Wort oder Satz eingeben (z. B. 长 / 一带一路 / 我想去中国旅行。)',
    reverseSearchPlaceholder:
      'Wort oder Satz in beliebiger Sprache eingeben (z. B. happy / je suis fatigué / "Ich möchte nach China reisen")',
    searchBtn: 'Suchen',
    searchLoading: 'Suche läuft…',
    searchHint: 'Enter zum Suchen · Umschalt+Enter für neue Zeile · ganze Sätze nur Übersetzung, kein Beispiel',

    dirZhToOther: 'Chinesisch → andere',
    dirOtherToZh: 'Andere → Chinesisch',
    dirZhToOtherShort: 'ZH→',
    dirOtherToZhShort: '→ZH',
    targetIsChinese: '→ Chinesisch',
    detectedLanguage: (v: Vars) => `Erkannt: ${v.lang}`,

    queryFailed: (v: Vars) => `Suche fehlgeschlagen: ${v.msg}`,
    emptyHint:
      'Geben Sie oben ein chinesisches Wort ein. Suchen werden automatisch nach Datum archiviert und können nach der Stunde als PPT exportiert werden.',
    emptyHintReverse:
      'Geben Sie ein Wort oder einen Satz in beliebiger Sprache ein und erhalten Sie idiomatische chinesische Ausdrücke.',

    translatedToLine: (v: Vars) =>
      `Übersetzt ins ${v.lang} · ${v.n} ${Number(v.n) === 1 ? 'Bedeutung' : 'Bedeutungen'}`,
    sentenceTranslatedTo: (v: Vars) => `Satzübersetzung · ${v.lang}`,
    cacheHitBadge: 'Zwischengespeichert',
    cacheHitTooltip:
      'Dieser Eintrag ist bereits in Ihrer Bibliothek; sofortige Wiederverwendung ohne KI-Kontingent.',
    chineseCandidatesLine: (v: Vars) =>
      `${v.lang} → Chinesisch · ${v.n} ${Number(v.n) === 1 ? 'Kandidat' : 'Kandidaten'}`,
    chineseCandidatesLineSingle: (v: Vars) => `${v.lang} → Chinesisch`,
    usageNote: 'Verwendung',
    pronunciation: 'Aussprache: ',
    example: 'Beispiel',
    deleteRecord: 'Diesen Eintrag löschen',
    refreshTooltip: 'Erneut abfragen (Cache überspringen)',
    previewEntryHint: 'Zum Anzeigen der vollständigen Definition klicken',

    registerCasual: 'umgangssprachlich',
    registerColloquial: 'kolloquial',
    registerNeutral: 'neutral',
    registerFormal: 'formell',
    registerLiterary: 'literarisch',
    dirBadgeZhToOther: 'ZH→',
    dirBadgeOtherToZh: '→ZH',

    tabAll: 'Alle',
    tabByDate: 'Nach Datum',
    tabByClass: 'Nach Stunde',

    emptyAll: 'Noch keine Suchen. Gehen Sie zu „Suchen" und geben Sie ein chinesisches Wort ein.',
    emptyByDate: 'Heute noch keine automatisch archivierten Suchen.',
    emptyByClass: 'Noch keine manuellen Stunden. Klicken Sie oben auf „Neue Stunde", um eine zu erstellen.',

    autoArchive: 'Auto',
    manualClass: 'Manuell',
    ended: 'Beendet',
    startedAt: (v: Vars) => `Begonnen ${v.time}`,
    endedAt: (v: Vars) => ` · beendet ${v.time}`,
    deleteSessionConfirm: (v: Vars) =>
      `Sitzung „${v.name}" löschen? Einträge werden nicht gelöscht.`,
    delete: 'Löschen',
    moreN: (v: Vars) => `+${v.n} weitere`,

    allEntriesSub: (v: Vars) =>
      `${v.lang} · ${v.time} · ${v.n} ${Number(v.n) === 1 ? 'Bedeutung' : 'Bedeutungen'}`,

    exportPptTitle: 'Als PPT exportieren',
    exportHint:
      'Wählen Sie links unter „Nach Datum" oder „Nach Stunde" eine oder mehrere Sitzungen aus und klicken Sie unten.',
    selectedSessions: (v: Vars) =>
      `${v.n} ${Number(v.n) === 1 ? 'Sitzung' : 'Sitzungen'} ausgewählt`,
    dedupedEntries: (v: Vars) =>
      `${v.n} ${Number(v.n) === 1 ? 'eindeutiger Eintrag' : 'eindeutige Einträge'} insgesamt`,
    includePinyin: 'Pinyin in Beispielen',
    includeExampleTranslation: 'Beispiele übersetzen',
    pptTitleLabel: 'PPT-Titel (optional)',
    pptTitlePlaceholder: 'Leer lassen für Stundenname',
    exportBtn: '.pptx exportieren',
    exporting: 'Wird erzeugt…',
    clearSelection: 'Auswahl löschen',
    exportFailed: (v: Vars) => `Export fehlgeschlagen: ${v.msg}`,

    nothingToExport: 'Keine Einträge zum Exportieren',
    pptFooterBrand: 'note.neooccidental.com · Chinesisch-Schnellnachschlag',
    pptEntriesCount: (v: Vars) =>
      `${v.n} ${Number(v.n) === 1 ? 'Eintrag' : 'Einträge'}`,
    pptGroupCount: (v: Vars) =>
      `${v.n} ${Number(v.n) === 1 ? 'Stunde' : 'Stunden'} / ${Number(v.n) === 1 ? 'Datum' : 'Daten'}`,

    loginTab: 'Anmelden',
    signupTab: 'Registrieren',
    emailLabel: 'E-Mail',
    passwordLabel: 'Passwort',
    displayNameLabel: 'Anzeigename',
    roleLabel: 'Ich bin',
    roleStudent: 'Schüler/in',
    roleStudentHint: 'Eigene Suchen verwalten',
    roleTeacher: 'Lehrer/in',
    roleTeacherHint: 'Ordner für Schüler/innen verwalten',
    signInBtn: 'Anmelden',
    signingIn: 'Anmeldung läuft…',
    signUpBtn: 'Konto erstellen',
    signingUp: 'Konto wird erstellt…',
    orDivider: 'oder',
    signInWithGoogle: 'Mit Google anmelden',
    signInWithGitHub: 'Mit GitHub anmelden',
    confirmEmailHeading: 'Posteingang prüfen',
    confirmEmailBody: (v: Vars) =>
      `Wir haben einen Bestätigungslink an ${v.email} gesendet. Klicken Sie darauf, um die Registrierung abzuschließen.`,
    confirmEmailHint:
      'Nicht erhalten? Spam-Ordner prüfen oder unten auf „E-Mail erneut senden" klicken.',
    confirmEmailAlreadyHeading: 'Diese E-Mail ist bereits registriert',
    confirmEmailAlreadyBody: (v: Vars) =>
      `${v.email} wurde bereits registriert, aber nie bestätigt. Supabase sendet nicht automatisch eine weitere E-Mail — klicken Sie unten auf „Erneut senden", oder melden Sie sich an, wenn Sie bereits bestätigt haben.`,
    confirmEmailResend: 'Bestätigungs-E-Mail erneut senden',
    confirmEmailResending: 'Wird gesendet…',
    confirmEmailResent: 'E-Mail erneut gesendet — bitte Posteingang prüfen.',
    confirmEmailResendFailed: (v: Vars) => `Erneutes Senden fehlgeschlagen: ${v.msg}`,
    confirmEmailGoLogin: 'Zur Anmeldung',

    pwRuleLen: 'Mindestens 8 Zeichen',
    pwRuleLower: 'Ein Kleinbuchstabe',
    pwRuleUpper: 'Ein Großbuchstabe',
    pwRuleDigit: 'Eine Ziffer',
    pwRuleSpecial: 'Ein Sonderzeichen',

    authConfigMissingTitle: 'Authentifizierung nicht konfiguriert',
    authConfigMissingBody:
      'Setzen Sie Supabase-URL und publishable Key in .env.local und laden Sie neu.',
    reloadPage: 'Seite neu laden & erneut versuchen',

    signOutBtn: 'Abmelden',
    roleBadgeStudent: 'Schüler/in',
    roleBadgeTeacher: 'Lehrer/in',
    helloUser: (v: Vars) => `Hallo ${v.name}`,

    contextLabel: 'Kontext',
    contextSelf: 'Ich',
    contextStudent: (v: Vars) => `Schüler/in: ${v.name}`,
    manageStudentsBtn: 'Schüler-Ordner verwalten',
    studentManagerTitle: 'Schüler-Ordner',
    studentManagerHint:
      'Jede/r Schüler/in bekommt einen eigenen Ordner. Suchen, die mit ausgewählter Person gemacht werden, gehören nur zu dieser Person — praktisch für Exporte und Wiederholungen pro Schüler/in.',
    studentEmpty: 'Noch keine Schüler-Ordner.',
    addStudentLabel: 'Schüler/in hinzufügen',
    addStudentPlaceholder: 'Name',
    addStudentBtn: 'Hinzufügen',
    studentRowEdit: 'Umbenennen',
    studentRowDelete: 'Löschen',
    studentRowSave: 'Speichern',
    studentRowCancel: 'Abbrechen',
    studentDeleteConfirm: (v: Vars) =>
      `Schüler/in „${v.name}" löschen? Alle Einträge und Stunden dieser Person werden ebenfalls gelöscht.`,
    closeBtn: 'Schließen',

    importLegacyTitle: 'Daten von diesem Gerät importieren?',
    importLegacyBody: (v: Vars) =>
      `Wir haben ${v.entries} Einträge und ${v.sessions} Stunden auf diesem Gerät gefunden (von vor Ihrer Registrierung). In Ihr Cloud-Konto importieren, damit sie auf anderen Geräten verfügbar sind?`,
    importLegacyConfirm: 'In die Cloud importieren',
    importLegacySkip: 'Überspringen',
    importLegacyImporting: 'Wird importiert…',
    importLegacyDone: (v: Vars) =>
      `${v.entries} ${Number(v.entries) === 1 ? 'Eintrag' : 'Einträge'} / ${v.sessions} ${Number(v.sessions) === 1 ? 'Sitzung' : 'Sitzungen'} importiert.`,
    importLegacyFailed: (v: Vars) => `Import fehlgeschlagen: ${v.msg}`,

    signupPromptTitle: 'Registrieren und Ihre Chinesisch-Wissensbasis aufbauen',
    signupPromptBody:
      'Sie können sofort Wörter nachschlagen — keine Anmeldung nötig. Mit Konto erhalten Sie zusätzlich:',
    signupPromptBullet1: 'In der Cloud gespeicherte Suchen, auf jedem Gerät verfügbar',
    signupPromptBullet2: 'Automatische Archivierung nach Datum / Stunde, Wiederholung und PPT-Export jederzeit',
    signupPromptBullet3: 'Bald verfügbar: automatisch erzeugte Tests & verteiltes Lernen',
    signupPromptBullet4: 'Als Lehrer/in registrieren und separate Ordner pro Schüler/in verwalten',
    signupPromptCtaSignup: 'Registrieren — kostenlos',
    signupPromptCtaLogin: 'Schon ein Konto? Anmelden',
    signupPromptDismiss: 'Schließen',

    historyAnonTitle: 'Verlauf erfordert ein Konto',
    historyAnonBody:
      'Anonyme Suchen werden nicht in der Cloud gespeichert. Registrieren Sie sich, und jede Suche wird automatisch nach Datum und Stunde archiviert — bereit für Wiederholung oder PPT-Export.',
  },

  /* ─────────────────────────── French ─────────────────────────── */
  fr: {
    appTitle: 'Recherche rapide de chinois pour la classe',
    tabSearch: 'Recherche',
    tabHistory: 'Historique & export',

    pinyin: 'Pinyin',
    uiLangLabel: 'Langue',
    translateTo: 'Traduire en',
    otherLang: 'Autre…',
    otherLangWith: (v: Vars) => `Autre : ${v.value}`,

    customLangTitle: 'Langue cible personnalisée',
    customLangHint: 'Saisissez n’importe quel nom de langue (p. ex. « Tiếng Việt », « Português », « हिन्दी »).',
    customLangPlaceholder: 'Nom de la langue',
    cancel: 'Annuler',
    confirm: 'OK',

    startNewClass: '+ Nouveau cours',
    endClass: 'Terminer le cours',
    currentClass: 'Cours',
    wordsUnit: (v: Vars) => `· ${v.n} mot${Number(v.n) === 1 ? '' : 's'}`,
    classNamePlaceholder: 'Nom du cours, p. ex. Chinois des affaires 3',
    start: 'Démarrer',

    searchPlaceholder: 'Saisissez un mot ou une phrase en chinois (p. ex. 长 / 一带一路 / 我想去中国旅行。)',
    reverseSearchPlaceholder:
      'Saisissez un mot ou une phrase dans n’importe quelle langue (p. ex. happy / je suis fatigué / « Je veux voyager en Chine »)',
    searchBtn: 'Rechercher',
    searchLoading: 'Recherche en cours…',
    searchHint: 'Entrée pour rechercher · Maj+Entrée pour saut de ligne · les phrases reçoivent uniquement la traduction, sans exemple',

    dirZhToOther: 'Chinois → autre',
    dirOtherToZh: 'Autre → chinois',
    dirZhToOtherShort: 'ZH→',
    dirOtherToZhShort: '→ZH',
    targetIsChinese: '→ chinois',
    detectedLanguage: (v: Vars) => `Détecté : ${v.lang}`,

    queryFailed: (v: Vars) => `Échec de la recherche : ${v.msg}`,
    emptyHint:
      'Saisissez un mot chinois ci-dessus pour commencer. Les recherches sont archivées automatiquement par date et exportables en PPT après le cours.',
    emptyHintReverse:
      'Saisissez un mot ou une phrase dans n’importe quelle langue et obtenez des expressions chinoises idiomatiques.',

    translatedToLine: (v: Vars) =>
      `Traduit en ${v.lang} · ${v.n} acception${Number(v.n) === 1 ? '' : 's'}`,
    sentenceTranslatedTo: (v: Vars) => `Traduction de phrase · ${v.lang}`,
    cacheHitBadge: 'En cache',
    cacheHitTooltip:
      'Cette entrée est déjà dans votre bibliothèque ; réutilisée instantanément sans consommer de quota IA.',
    chineseCandidatesLine: (v: Vars) =>
      `${v.lang} → chinois · ${v.n} candidat${Number(v.n) === 1 ? '' : 's'}`,
    chineseCandidatesLineSingle: (v: Vars) => `${v.lang} → chinois`,
    usageNote: 'Quand l’utiliser',
    pronunciation: 'Pron. : ',
    example: 'Exemple',
    deleteRecord: 'Supprimer cet enregistrement',
    refreshTooltip: 'Rechercher à nouveau (ignorer le cache)',
    previewEntryHint: 'Cliquez pour voir la définition complète',

    registerCasual: 'familier',
    registerColloquial: 'courant',
    registerNeutral: 'neutre',
    registerFormal: 'formel',
    registerLiterary: 'littéraire',
    dirBadgeZhToOther: 'ZH→',
    dirBadgeOtherToZh: '→ZH',

    tabAll: 'Toutes',
    tabByDate: 'Par date',
    tabByClass: 'Par cours',

    emptyAll: 'Pas encore de recherches. Allez dans « Recherche » et saisissez un mot chinois.',
    emptyByDate: 'Pas encore de recherches archivées aujourd’hui.',
    emptyByClass: 'Pas encore de cours manuels. Cliquez sur « Nouveau cours » en haut pour en créer un.',

    autoArchive: 'Auto',
    manualClass: 'Manuel',
    ended: 'Terminé',
    startedAt: (v: Vars) => `Commencé ${v.time}`,
    endedAt: (v: Vars) => ` · terminé ${v.time}`,
    deleteSessionConfirm: (v: Vars) =>
      `Supprimer la session « ${v.name} » ? Les entrées ne seront pas supprimées.`,
    delete: 'Supprimer',
    moreN: (v: Vars) => `+${v.n} de plus`,

    allEntriesSub: (v: Vars) =>
      `${v.lang} · ${v.time} · ${v.n} acception${Number(v.n) === 1 ? '' : 's'}`,

    exportPptTitle: 'Exporter en PPT',
    exportHint:
      'Sélectionnez une ou plusieurs sessions dans « Par date » ou « Par cours » à gauche, puis cliquez ci-dessous.',
    selectedSessions: (v: Vars) =>
      `${v.n} session${Number(v.n) === 1 ? '' : 's'} sélectionnée${Number(v.n) === 1 ? '' : 's'}`,
    dedupedEntries: (v: Vars) =>
      `${v.n} entrée${Number(v.n) === 1 ? '' : 's'} unique${Number(v.n) === 1 ? '' : 's'} au total`,
    includePinyin: 'Pinyin sur les exemples',
    includeExampleTranslation: 'Traduire les exemples',
    pptTitleLabel: 'Titre du PPT (optionnel)',
    pptTitlePlaceholder: 'Vide pour utiliser le nom du cours',
    exportBtn: 'Exporter .pptx',
    exporting: 'Génération…',
    clearSelection: 'Effacer la sélection',
    exportFailed: (v: Vars) => `Échec de l’export : ${v.msg}`,

    nothingToExport: 'Aucune entrée à exporter',
    pptFooterBrand: 'note.neooccidental.com · Recherche rapide de chinois',
    pptEntriesCount: (v: Vars) =>
      `${v.n} entrée${Number(v.n) === 1 ? '' : 's'}`,
    pptGroupCount: (v: Vars) =>
      `${v.n} cours / date${Number(v.n) === 1 ? '' : 's'}`,

    loginTab: 'Connexion',
    signupTab: 'Inscription',
    emailLabel: 'E-mail',
    passwordLabel: 'Mot de passe',
    displayNameLabel: 'Nom affiché',
    roleLabel: 'Je suis',
    roleStudent: 'Élève',
    roleStudentHint: 'Suivre mes propres recherches',
    roleTeacher: 'Enseignant·e',
    roleTeacherHint: 'Gérer des dossiers pour mes élèves',
    signInBtn: 'Se connecter',
    signingIn: 'Connexion…',
    signUpBtn: 'Créer un compte',
    signingUp: 'Création du compte…',
    orDivider: 'ou',
    signInWithGoogle: 'Se connecter avec Google',
    signInWithGitHub: 'Se connecter avec GitHub',
    confirmEmailHeading: 'Vérifiez votre boîte mail',
    confirmEmailBody: (v: Vars) =>
      `Nous avons envoyé un lien de confirmation à ${v.email}. Cliquez dessus pour terminer l’inscription.`,
    confirmEmailHint:
      'Pas reçu ? Vérifiez votre dossier spam ou utilisez « Renvoyer l’e-mail » ci-dessous.',
    confirmEmailAlreadyHeading: 'Cette adresse est déjà enregistrée',
    confirmEmailAlreadyBody: (v: Vars) =>
      `${v.email} a déjà été enregistré mais jamais confirmé. Supabase n’enverra pas automatiquement un autre e-mail — cliquez ci-dessous pour renvoyer, ou connectez-vous si vous avez déjà confirmé.`,
    confirmEmailResend: 'Renvoyer l’e-mail de confirmation',
    confirmEmailResending: 'Envoi…',
    confirmEmailResent: 'E-mail renvoyé — vérifiez votre boîte de réception.',
    confirmEmailResendFailed: (v: Vars) => `Échec du renvoi : ${v.msg}`,
    confirmEmailGoLogin: 'Aller à la connexion',

    pwRuleLen: 'Au moins 8 caractères',
    pwRuleLower: 'Une lettre minuscule',
    pwRuleUpper: 'Une lettre majuscule',
    pwRuleDigit: 'Un chiffre',
    pwRuleSpecial: 'Un caractère spécial',

    authConfigMissingTitle: 'Authentification non configurée',
    authConfigMissingBody:
      'Définissez l’URL Supabase et la clé publishable dans .env.local puis rechargez.',
    reloadPage: 'Recharger la page et réessayer',

    signOutBtn: 'Se déconnecter',
    roleBadgeStudent: 'Élève',
    roleBadgeTeacher: 'Enseignant·e',
    helloUser: (v: Vars) => `Bonjour, ${v.name}`,

    contextLabel: 'Contexte',
    contextSelf: 'Moi-même',
    contextStudent: (v: Vars) => `Élève : ${v.name}`,
    manageStudentsBtn: 'Gérer les dossiers d’élèves',
    studentManagerTitle: 'Dossiers d’élèves',
    studentManagerHint:
      'Chaque élève a un dossier privé. Les recherches faites avec un élève sélectionné lui appartiennent uniquement — pratique pour les exports et révisions par élève.',
    studentEmpty: 'Pas encore de dossiers d’élèves.',
    addStudentLabel: 'Ajouter un élève',
    addStudentPlaceholder: 'Nom de l’élève',
    addStudentBtn: 'Ajouter',
    studentRowEdit: 'Renommer',
    studentRowDelete: 'Supprimer',
    studentRowSave: 'Enregistrer',
    studentRowCancel: 'Annuler',
    studentDeleteConfirm: (v: Vars) =>
      `Supprimer l’élève « ${v.name} » ? Toutes les entrées et sessions de cet élève seront aussi supprimées.`,
    closeBtn: 'Fermer',

    importLegacyTitle: 'Importer les données de cet appareil ?',
    importLegacyBody: (v: Vars) =>
      `Nous avons trouvé ${v.entries} entrées et ${v.sessions} sessions enregistrées localement sur cet appareil (avant votre inscription). Les importer dans votre compte cloud pour les retrouver sur d’autres appareils ?`,
    importLegacyConfirm: 'Importer dans le cloud',
    importLegacySkip: 'Ignorer',
    importLegacyImporting: 'Importation…',
    importLegacyDone: (v: Vars) =>
      `${v.entries} entrée${Number(v.entries) === 1 ? '' : 's'} / ${v.sessions} session${Number(v.sessions) === 1 ? '' : 's'} importées.`,
    importLegacyFailed: (v: Vars) => `Import échoué : ${v.msg}`,

    signupPromptTitle: 'Inscrivez-vous pour bâtir votre base de connaissances en chinois',
    signupPromptBody:
      'Vous pouvez chercher des mots dès maintenant — sans inscription. Inscrivez-vous pour débloquer :',
    signupPromptBullet1: 'Recherches sauvegardées dans le cloud, accessibles depuis n’importe quel appareil',
    signupPromptBullet2: 'Archivage automatique par date / cours, révision et export PPT à tout moment',
    signupPromptBullet3: 'Bientôt : quiz auto-générés et révisions espacées',
    signupPromptBullet4: 'Inscription comme enseignant·e pour gérer des dossiers séparés par élève',
    signupPromptCtaSignup: 'S’inscrire — gratuit',
    signupPromptCtaLogin: 'Vous avez déjà un compte ? Se connecter',
    signupPromptDismiss: 'Fermer',

    historyAnonTitle: 'L’historique nécessite un compte',
    historyAnonBody:
      'Les recherches anonymes ne sont pas sauvegardées dans le cloud. Inscrivez-vous et chaque recherche sera archivée automatiquement par date et cours, prête pour la révision ou l’export PPT.',
  },

  /* ─────────────────────────── Japanese ─────────────────────────── */
  ja: {
    appTitle: '授業向け中国語クイック検索',
    tabSearch: '検索',
    tabHistory: '履歴とエクスポート',

    pinyin: 'ピンイン',
    uiLangLabel: '言語',
    translateTo: '翻訳先',
    otherLang: 'その他…',
    otherLangWith: (v: Vars) => `その他：${v.value}`,

    customLangTitle: 'カスタム翻訳先言語',
    customLangHint: '任意の言語名を入力してください（例：「Tiếng Việt」「Português」「हिन्दी」）。',
    customLangPlaceholder: '言語名',
    cancel: 'キャンセル',
    confirm: 'OK',

    startNewClass: '+ 新しい授業',
    endClass: '授業を終了',
    currentClass: '授業',
    wordsUnit: (v: Vars) => `· ${v.n} 単語`,
    classNamePlaceholder: '授業名（例：ビジネス中国語 3）',
    start: '開始',

    searchPlaceholder: '中国語の単語または文を入力（例：长 / 一带一路 / 我想去中国旅行。）',
    reverseSearchPlaceholder:
      '任意の言語の単語や文を入力（例：happy / je suis fatigué / 「中国に旅行したい」）',
    searchBtn: '検索',
    searchLoading: '検索中…',
    searchHint: 'Enter で検索 · Shift+Enter で改行 · 文を入力した場合は翻訳のみ、例文は出ません',

    dirZhToOther: '中国語 → 他言語',
    dirOtherToZh: '他言語 → 中国語',
    dirZhToOtherShort: '中→他',
    dirOtherToZhShort: '他→中',
    targetIsChinese: '→ 中国語',
    detectedLanguage: (v: Vars) => `検出：${v.lang}`,

    queryFailed: (v: Vars) => `検索失敗：${v.msg}`,
    emptyHint:
      '上に中国語の単語を入力してください。検索は日付ごとに自動アーカイブされ、授業後に PPT としてエクスポートできます。',
    emptyHintReverse:
      '任意の言語の単語や文を入力すると、自然な中国語表現が得られます。',

    translatedToLine: (v: Vars) =>
      `${v.lang} に翻訳 · ${v.n} 件の意味`,
    sentenceTranslatedTo: (v: Vars) => `文の翻訳 · ${v.lang}`,
    cacheHitBadge: 'キャッシュ済み',
    cacheHitTooltip:
      'この項目はライブラリに既にあります。AI 利用枠を消費せず即座に再利用されます。',
    chineseCandidatesLine: (v: Vars) =>
      `${v.lang} → 中国語 · ${v.n} 件の候補`,
    chineseCandidatesLineSingle: (v: Vars) => `${v.lang} → 中国語`,
    usageNote: '使い方',
    pronunciation: '発音：',
    example: '例文',
    deleteRecord: 'この記録を削除',
    refreshTooltip: '再検索（キャッシュをスキップ）',
    previewEntryHint: 'クリックして完全な定義を表示',

    registerCasual: 'カジュアル',
    registerColloquial: '口語',
    registerNeutral: '中立',
    registerFormal: 'フォーマル',
    registerLiterary: '文語',
    dirBadgeZhToOther: '中→',
    dirBadgeOtherToZh: '→中',

    tabAll: 'すべて',
    tabByDate: '日付別',
    tabByClass: '授業別',

    emptyAll: 'まだ検索がありません。「検索」タブで中国語を入力してください。',
    emptyByDate: '本日の自動アーカイブはまだありません。',
    emptyByClass: 'まだ手動の授業がありません。上部の「新しい授業」をクリックして作成してください。',

    autoArchive: '自動',
    manualClass: '手動',
    ended: '終了',
    startedAt: (v: Vars) => `開始 ${v.time}`,
    endedAt: (v: Vars) => ` · 終了 ${v.time}`,
    deleteSessionConfirm: (v: Vars) =>
      `セッション「${v.name}」を削除しますか？項目は削除されません。`,
    delete: '削除',
    moreN: (v: Vars) => `+${v.n} 件`,

    allEntriesSub: (v: Vars) =>
      `${v.lang} · ${v.time} · ${v.n} 意味`,

    exportPptTitle: 'PPT としてエクスポート',
    exportHint:
      '左の「日付別」または「授業別」でセッションを選択し、下のボタンをクリックします。',
    selectedSessions: (v: Vars) => `${v.n} セッション選択中`,
    dedupedEntries: (v: Vars) => `合計 ${v.n} 件のユニーク項目`,
    includePinyin: '例文にピンイン',
    includeExampleTranslation: '例文を翻訳',
    pptTitleLabel: 'PPT タイトル（任意）',
    pptTitlePlaceholder: '空欄の場合は授業名を使用',
    exportBtn: '.pptx をエクスポート',
    exporting: '生成中…',
    clearSelection: '選択をクリア',
    exportFailed: (v: Vars) => `エクスポート失敗：${v.msg}`,

    nothingToExport: 'エクスポートできる項目がありません',
    pptFooterBrand: 'note.neooccidental.com · 授業向け中国語クイック検索',
    pptEntriesCount: (v: Vars) => `${v.n} 件`,
    pptGroupCount: (v: Vars) => `${v.n} 授業 / 日付`,

    loginTab: 'ログイン',
    signupTab: '登録',
    emailLabel: 'メール',
    passwordLabel: 'パスワード',
    displayNameLabel: '表示名',
    roleLabel: '私は',
    roleStudent: '生徒',
    roleStudentHint: '自分の検索を記録',
    roleTeacher: '教師',
    roleTeacherHint: '生徒ごとのフォルダを管理',
    signInBtn: 'ログイン',
    signingIn: 'ログイン中…',
    signUpBtn: 'アカウントを作成',
    signingUp: 'アカウント作成中…',
    orDivider: 'または',
    signInWithGoogle: 'Google でログイン',
    signInWithGitHub: 'GitHub でログイン',
    confirmEmailHeading: 'メールをご確認ください',
    confirmEmailBody: (v: Vars) =>
      `${v.email} に確認リンクを送信しました。リンクをクリックして登録を完了してください。`,
    confirmEmailHint:
      '届いていない場合はスパムフォルダを確認するか、下の「メールを再送」をクリックしてください。',
    confirmEmailAlreadyHeading: 'このメールは既に登録済みです',
    confirmEmailAlreadyBody: (v: Vars) =>
      `${v.email} は以前登録されましたが未確認です。Supabase は自動で再送信しません。下の再送ボタンを使うか、すでに確認済みの場合はそのままログインしてください。`,
    confirmEmailResend: '確認メールを再送',
    confirmEmailResending: '送信中…',
    confirmEmailResent: 'メールを再送しました。受信箱をご確認ください。',
    confirmEmailResendFailed: (v: Vars) => `再送失敗：${v.msg}`,
    confirmEmailGoLogin: 'ログイン画面へ',

    pwRuleLen: '8 文字以上',
    pwRuleLower: '小文字を含む',
    pwRuleUpper: '大文字を含む',
    pwRuleDigit: '数字を含む',
    pwRuleSpecial: '特殊文字を含む',

    authConfigMissingTitle: '認証が未設定です',
    authConfigMissingBody:
      '.env.local に Supabase URL と publishable key を設定して再読み込みしてください。',
    reloadPage: 'ページを再読み込みして再試行',

    signOutBtn: 'ログアウト',
    roleBadgeStudent: '生徒',
    roleBadgeTeacher: '教師',
    helloUser: (v: Vars) => `こんにちは、${v.name}`,

    contextLabel: 'コンテキスト',
    contextSelf: '自分',
    contextStudent: (v: Vars) => `生徒：${v.name}`,
    manageStudentsBtn: '生徒フォルダを管理',
    studentManagerTitle: '生徒フォルダ',
    studentManagerHint:
      '生徒ごとに個別のフォルダがあります。生徒を選択中に行った検索はその生徒のみに帰属し、個別エクスポートや復習に便利です。',
    studentEmpty: 'まだ生徒フォルダがありません。',
    addStudentLabel: '生徒を追加',
    addStudentPlaceholder: '生徒名',
    addStudentBtn: '追加',
    studentRowEdit: '名前を変更',
    studentRowDelete: '削除',
    studentRowSave: '保存',
    studentRowCancel: 'キャンセル',
    studentDeleteConfirm: (v: Vars) =>
      `生徒「${v.name}」を削除しますか？この生徒に属するすべての項目と授業も一緒に削除されます。`,
    closeBtn: '閉じる',

    importLegacyTitle: 'このデバイスのデータをインポートしますか？',
    importLegacyBody: (v: Vars) =>
      `このデバイスにローカル保存された ${v.entries} 件の項目と ${v.sessions} 件のセッションが見つかりました（登録前のものです）。クラウドアカウントにインポートして他のデバイスでも利用できるようにしますか？`,
    importLegacyConfirm: 'クラウドにインポート',
    importLegacySkip: 'スキップ',
    importLegacyImporting: 'インポート中…',
    importLegacyDone: (v: Vars) =>
      `${v.entries} 件の項目 / ${v.sessions} 件のセッションをインポートしました。`,
    importLegacyFailed: (v: Vars) => `インポート失敗：${v.msg}`,

    signupPromptTitle: '登録して中国語ナレッジベースを構築',
    signupPromptBody:
      '今すぐ単語を検索できます — ログイン不要。登録すると以下の機能が使えます：',
    signupPromptBullet1: '検索内容をクラウド保存、どのデバイスからでも利用可能',
    signupPromptBullet2: '日付・授業ごとに自動アーカイブ、いつでも復習や PPT エクスポート',
    signupPromptBullet3: '近日予定：自動クイズと間隔反復学習',
    signupPromptBullet4: '教師として登録すると、生徒ごとに別々のフォルダを管理可能',
    signupPromptCtaSignup: '無料登録',
    signupPromptCtaLogin: 'すでにアカウントをお持ちですか？ログイン',
    signupPromptDismiss: '閉じる',

    historyAnonTitle: '履歴を見るにはログインが必要です',
    historyAnonBody:
      '匿名検索はクラウドに保存されません。登録すれば、すべての検索が日付と授業ごとに自動アーカイブされ、復習や PPT エクスポートに使えます。',
  },

  /* ─────────────────────────── Korean ─────────────────────────── */
  ko: {
    appTitle: '수업용 중국어 빠른 검색',
    tabSearch: '검색',
    tabHistory: '기록 및 내보내기',

    pinyin: '병음',
    uiLangLabel: '언어',
    translateTo: '번역할 언어',
    otherLang: '기타…',
    otherLangWith: (v: Vars) => `기타: ${v.value}`,

    customLangTitle: '사용자 지정 대상 언어',
    customLangHint: '아무 언어 이름이나 입력하세요(예: "Tiếng Việt", "Português", "हिन्दी").',
    customLangPlaceholder: '언어 이름',
    cancel: '취소',
    confirm: '확인',

    startNewClass: '+ 새 수업',
    endClass: '수업 종료',
    currentClass: '수업',
    wordsUnit: (v: Vars) => `· ${v.n}개 단어`,
    classNamePlaceholder: '수업 이름(예: 비즈니스 중국어 3)',
    start: '시작',

    searchPlaceholder: '중국어 단어 또는 문장 입력(예: 长 / 一带一路 / 我想去中国旅行。)',
    reverseSearchPlaceholder:
      '아무 언어로 단어나 문장을 입력하세요(예: happy / je suis fatigué / "중국에 여행 가고 싶어요")',
    searchBtn: '검색',
    searchLoading: '검색 중…',
    searchHint: 'Enter로 검색 · Shift+Enter로 줄바꿈 · 문장 입력 시 번역만 제공되고 예문은 없음',

    dirZhToOther: '중국어 → 다른 언어',
    dirOtherToZh: '다른 언어 → 중국어',
    dirZhToOtherShort: '중→타',
    dirOtherToZhShort: '타→중',
    targetIsChinese: '→ 중국어',
    detectedLanguage: (v: Vars) => `감지됨: ${v.lang}`,

    queryFailed: (v: Vars) => `검색 실패: ${v.msg}`,
    emptyHint:
      '위에 중국어 단어를 입력해 시작하세요. 검색은 날짜별로 자동 보관되며 수업 후 PPT로 내보낼 수 있습니다.',
    emptyHintReverse:
      '아무 언어로 단어나 문장을 입력하면 자연스러운 중국어 표현을 얻을 수 있습니다.',

    translatedToLine: (v: Vars) =>
      `${v.lang}로 번역 · 의미 ${v.n}개`,
    sentenceTranslatedTo: (v: Vars) => `문장 번역 · ${v.lang}`,
    cacheHitBadge: '캐시됨',
    cacheHitTooltip:
      '이 항목은 이미 라이브러리에 있습니다. AI 사용량 없이 즉시 재사용됩니다.',
    chineseCandidatesLine: (v: Vars) =>
      `${v.lang} → 중국어 · 후보 ${v.n}개`,
    chineseCandidatesLineSingle: (v: Vars) => `${v.lang} → 중국어`,
    usageNote: '사용 시점',
    pronunciation: '발음: ',
    example: '예문',
    deleteRecord: '이 기록 삭제',
    refreshTooltip: '다시 검색 (캐시 건너뛰기)',
    previewEntryHint: '클릭하면 전체 정의 보기',

    registerCasual: '캐주얼',
    registerColloquial: '구어',
    registerNeutral: '중립',
    registerFormal: '격식',
    registerLiterary: '문어',
    dirBadgeZhToOther: '중→',
    dirBadgeOtherToZh: '→중',

    tabAll: '전체',
    tabByDate: '날짜별',
    tabByClass: '수업별',

    emptyAll: '아직 검색이 없습니다. "검색" 탭에서 중국어 단어를 입력해 시작하세요.',
    emptyByDate: '오늘 자동 보관된 검색이 아직 없습니다.',
    emptyByClass: '아직 수동 수업이 없습니다. 상단의 "새 수업"을 눌러 생성하세요.',

    autoArchive: '자동',
    manualClass: '수동',
    ended: '종료됨',
    startedAt: (v: Vars) => `시작 ${v.time}`,
    endedAt: (v: Vars) => ` · 종료 ${v.time}`,
    deleteSessionConfirm: (v: Vars) =>
      `세션 "${v.name}"을(를) 삭제할까요? 항목은 삭제되지 않습니다.`,
    delete: '삭제',
    moreN: (v: Vars) => `+${v.n}개 더`,

    allEntriesSub: (v: Vars) =>
      `${v.lang} · ${v.time} · 의미 ${v.n}개`,

    exportPptTitle: 'PPT로 내보내기',
    exportHint:
      '왼쪽 "날짜별" 또는 "수업별"에서 세션을 선택하고 아래 버튼을 클릭하세요.',
    selectedSessions: (v: Vars) => `${v.n}개 세션 선택됨`,
    dedupedEntries: (v: Vars) => `중복 제거 후 총 ${v.n}개 항목`,
    includePinyin: '예문에 병음 포함',
    includeExampleTranslation: '예문 번역 포함',
    pptTitleLabel: 'PPT 제목(선택)',
    pptTitlePlaceholder: '비워 두면 수업 이름 사용',
    exportBtn: '.pptx 내보내기',
    exporting: '생성 중…',
    clearSelection: '선택 지우기',
    exportFailed: (v: Vars) => `내보내기 실패: ${v.msg}`,

    nothingToExport: '내보낼 항목 없음',
    pptFooterBrand: 'note.neooccidental.com · 수업용 중국어 빠른 검색',
    pptEntriesCount: (v: Vars) => `항목 ${v.n}개`,
    pptGroupCount: (v: Vars) => `수업 / 날짜 ${v.n}개`,

    loginTab: '로그인',
    signupTab: '가입',
    emailLabel: '이메일',
    passwordLabel: '비밀번호',
    displayNameLabel: '표시 이름',
    roleLabel: '나는',
    roleStudent: '학생',
    roleStudentHint: '내 검색 기록 관리',
    roleTeacher: '교사',
    roleTeacherHint: '학생별 폴더 관리',
    signInBtn: '로그인',
    signingIn: '로그인 중…',
    signUpBtn: '계정 만들기',
    signingUp: '계정 생성 중…',
    orDivider: '또는',
    signInWithGoogle: 'Google로 로그인',
    signInWithGitHub: 'GitHub로 로그인',
    confirmEmailHeading: '받은 편지함을 확인하세요',
    confirmEmailBody: (v: Vars) =>
      `${v.email}로 확인 링크를 보냈습니다. 클릭해서 가입을 완료하세요.`,
    confirmEmailHint:
      '받지 못하셨나요? 스팸 폴더를 확인하거나 아래 "이메일 다시 보내기"를 사용하세요.',
    confirmEmailAlreadyHeading: '이 이메일은 이미 등록되어 있습니다',
    confirmEmailAlreadyBody: (v: Vars) =>
      `${v.email}은(는) 이전에 등록되었지만 아직 확인되지 않았습니다. Supabase는 자동으로 다시 보내지 않습니다. 아래 버튼으로 다시 보내거나, 이미 확인했다면 바로 로그인하세요.`,
    confirmEmailResend: '확인 이메일 다시 보내기',
    confirmEmailResending: '보내는 중…',
    confirmEmailResent: '이메일을 다시 보냈습니다. 받은 편지함을 확인하세요.',
    confirmEmailResendFailed: (v: Vars) => `다시 보내기 실패: ${v.msg}`,
    confirmEmailGoLogin: '로그인 화면으로',

    pwRuleLen: '8자 이상',
    pwRuleLower: '소문자 포함',
    pwRuleUpper: '대문자 포함',
    pwRuleDigit: '숫자 포함',
    pwRuleSpecial: '특수문자 포함',

    authConfigMissingTitle: '인증이 구성되지 않았습니다',
    authConfigMissingBody:
      '.env.local에 Supabase URL과 publishable key를 설정한 후 다시 로드하세요.',
    reloadPage: '페이지 새로고침 후 다시 시도',

    signOutBtn: '로그아웃',
    roleBadgeStudent: '학생',
    roleBadgeTeacher: '교사',
    helloUser: (v: Vars) => `안녕하세요, ${v.name}님`,

    contextLabel: '컨텍스트',
    contextSelf: '나',
    contextStudent: (v: Vars) => `학생: ${v.name}`,
    manageStudentsBtn: '학생 폴더 관리',
    studentManagerTitle: '학생 폴더',
    studentManagerHint:
      '각 학생마다 개인 폴더가 있습니다. 학생을 선택한 상태에서 한 검색은 해당 학생에게만 속하며, 학생별 내보내기와 복습에 유용합니다.',
    studentEmpty: '아직 학생 폴더가 없습니다.',
    addStudentLabel: '학생 추가',
    addStudentPlaceholder: '학생 이름',
    addStudentBtn: '추가',
    studentRowEdit: '이름 변경',
    studentRowDelete: '삭제',
    studentRowSave: '저장',
    studentRowCancel: '취소',
    studentDeleteConfirm: (v: Vars) =>
      `학생 "${v.name}"을(를) 삭제할까요? 이 학생의 모든 항목과 수업 세션도 함께 삭제됩니다.`,
    closeBtn: '닫기',

    importLegacyTitle: '이 기기의 데이터를 가져올까요?',
    importLegacyBody: (v: Vars) =>
      `이 기기에 로컬로 저장된 항목 ${v.entries}개와 수업 세션 ${v.sessions}개를 발견했습니다(가입 전의 데이터입니다). 클라우드 계정으로 가져와서 다른 기기에서도 사용할까요?`,
    importLegacyConfirm: '클라우드로 가져오기',
    importLegacySkip: '건너뛰기',
    importLegacyImporting: '가져오는 중…',
    importLegacyDone: (v: Vars) =>
      `항목 ${v.entries}개 / 세션 ${v.sessions}개를 가져왔습니다.`,
    importLegacyFailed: (v: Vars) => `가져오기 실패: ${v.msg}`,

    signupPromptTitle: '가입하고 중국어 지식 베이스를 구축하세요',
    signupPromptBody:
      '지금 바로 단어를 검색할 수 있습니다 — 로그인 불필요. 가입하면 다음 기능이 잠금 해제됩니다:',
    signupPromptBullet1: '클라우드에 저장되는 검색 기록, 모든 기기에서 사용 가능',
    signupPromptBullet2: '날짜 / 수업별 자동 보관, 언제든 복습하고 PPT로 내보내기',
    signupPromptBullet3: '곧 출시: 자동 생성 퀴즈와 간격 반복 복습',
    signupPromptBullet4: '교사로 가입하면 학생별로 별도 폴더 관리 가능',
    signupPromptCtaSignup: '무료 가입',
    signupPromptCtaLogin: '이미 계정이 있으신가요? 로그인',
    signupPromptDismiss: '닫기',

    historyAnonTitle: '기록을 보려면 계정이 필요합니다',
    historyAnonBody:
      '익명 검색은 클라우드에 저장되지 않습니다. 가입하면 모든 검색이 날짜와 수업별로 자동 보관되어 복습이나 PPT 내보내기에 바로 사용할 수 있습니다.',
  },

  /* ─────────────────────────── Russian ─────────────────────────── */
  ru: {
    appTitle: 'Быстрый поиск китайского для урока',
    tabSearch: 'Поиск',
    tabHistory: 'История и экспорт',

    pinyin: 'Пиньинь',
    uiLangLabel: 'Язык',
    translateTo: 'Перевод на',
    otherLang: 'Другой…',
    otherLangWith: (v: Vars) => `Другой: ${v.value}`,

    customLangTitle: 'Свой язык перевода',
    customLangHint: 'Введите название любого языка (например, «Tiếng Việt», «Português», «हिन्दी»).',
    customLangPlaceholder: 'Название языка',
    cancel: 'Отмена',
    confirm: 'OK',

    startNewClass: '+ Новый урок',
    endClass: 'Завершить урок',
    currentClass: 'Урок',
    wordsUnit: (v: Vars) => `· ${v.n} слов(а)`,
    classNamePlaceholder: 'Название урока, например «Деловой китайский 3»',
    start: 'Начать',

    searchPlaceholder: 'Введите китайское слово или фразу (например, 长 / 一带一路 / 我想去中国旅行。)',
    reverseSearchPlaceholder:
      'Введите слово или фразу на любом языке (например, happy / je suis fatigué / «Хочу поехать в Китай»)',
    searchBtn: 'Найти',
    searchLoading: 'Поиск…',
    searchHint: 'Enter — найти · Shift+Enter — новая строка · для целых фраз даётся только перевод, без примера',

    dirZhToOther: 'Китайский → другой',
    dirOtherToZh: 'Другой → китайский',
    dirZhToOtherShort: 'ZH→',
    dirOtherToZhShort: '→ZH',
    targetIsChinese: '→ китайский',
    detectedLanguage: (v: Vars) => `Определён: ${v.lang}`,

    queryFailed: (v: Vars) => `Ошибка поиска: ${v.msg}`,
    emptyHint:
      'Введите китайское слово выше, чтобы начать. Поисковые запросы автоматически архивируются по дате и могут быть экспортированы в PPT после урока.',
    emptyHintReverse:
      'Введите слово или фразу на любом языке — получите естественные китайские выражения.',

    translatedToLine: (v: Vars) =>
      `Перевод на ${v.lang} · ${v.n} значени(е/я/й)`,
    sentenceTranslatedTo: (v: Vars) => `Перевод фразы · ${v.lang}`,
    cacheHitBadge: 'Из кэша',
    cacheHitTooltip:
      'Эта запись уже есть в вашей библиотеке; используется мгновенно без расхода квоты ИИ.',
    chineseCandidatesLine: (v: Vars) =>
      `${v.lang} → китайский · ${v.n} вариант(а/ов)`,
    chineseCandidatesLineSingle: (v: Vars) => `${v.lang} → китайский`,
    usageNote: 'Когда использовать',
    pronunciation: 'Произн.: ',
    example: 'Пример',
    deleteRecord: 'Удалить эту запись',
    refreshTooltip: 'Повторить запрос (без кэша)',
    previewEntryHint: 'Нажмите, чтобы увидеть полное определение',

    registerCasual: 'разговорный',
    registerColloquial: 'обиходный',
    registerNeutral: 'нейтральный',
    registerFormal: 'официальный',
    registerLiterary: 'книжный',
    dirBadgeZhToOther: 'ZH→',
    dirBadgeOtherToZh: '→ZH',

    tabAll: 'Все',
    tabByDate: 'По дате',
    tabByClass: 'По уроку',

    emptyAll: 'Поисков ещё нет. Перейдите на «Поиск» и введите китайское слово.',
    emptyByDate: 'Сегодня ещё нет автоматически архивированных поисков.',
    emptyByClass: 'Ручных уроков пока нет. Нажмите «Новый урок» сверху, чтобы создать.',

    autoArchive: 'Авто',
    manualClass: 'Вручную',
    ended: 'Завершён',
    startedAt: (v: Vars) => `Начат ${v.time}`,
    endedAt: (v: Vars) => ` · завершён ${v.time}`,
    deleteSessionConfirm: (v: Vars) =>
      `Удалить сессию «${v.name}»? Записи не будут удалены.`,
    delete: 'Удалить',
    moreN: (v: Vars) => `+ ещё ${v.n}`,

    allEntriesSub: (v: Vars) =>
      `${v.lang} · ${v.time} · ${v.n} значени(е/я/й)`,

    exportPptTitle: 'Экспорт в PPT',
    exportHint:
      'Выберите одну или несколько сессий слева в «По дате» или «По уроку» и нажмите кнопку ниже.',
    selectedSessions: (v: Vars) => `Выбрано сессий: ${v.n}`,
    dedupedEntries: (v: Vars) => `Уникальных записей: ${v.n}`,
    includePinyin: 'Пиньинь в примерах',
    includeExampleTranslation: 'Перевод примеров',
    pptTitleLabel: 'Заголовок PPT (необязательно)',
    pptTitlePlaceholder: 'Если пусто — используется название урока',
    exportBtn: 'Экспорт .pptx',
    exporting: 'Создаётся…',
    clearSelection: 'Очистить выбор',
    exportFailed: (v: Vars) => `Ошибка экспорта: ${v.msg}`,

    nothingToExport: 'Нет записей для экспорта',
    pptFooterBrand: 'note.neooccidental.com · Быстрый поиск китайского',
    pptEntriesCount: (v: Vars) => `Записей: ${v.n}`,
    pptGroupCount: (v: Vars) => `${v.n} урок(а/ов) / дат(а/ы)`,

    loginTab: 'Войти',
    signupTab: 'Регистрация',
    emailLabel: 'Эл. почта',
    passwordLabel: 'Пароль',
    displayNameLabel: 'Имя',
    roleLabel: 'Я',
    roleStudent: 'Ученик',
    roleStudentHint: 'Сохранять свои поиски',
    roleTeacher: 'Учитель',
    roleTeacherHint: 'Управлять папками для своих учеников',
    signInBtn: 'Войти',
    signingIn: 'Вход…',
    signUpBtn: 'Создать аккаунт',
    signingUp: 'Создание аккаунта…',
    orDivider: 'или',
    signInWithGoogle: 'Войти через Google',
    signInWithGitHub: 'Войти через GitHub',
    confirmEmailHeading: 'Проверьте почту',
    confirmEmailBody: (v: Vars) =>
      `Мы отправили ссылку для подтверждения на ${v.email}. Нажмите её, чтобы завершить регистрацию.`,
    confirmEmailHint:
      'Не пришло? Проверьте папку «Спам» или нажмите «Отправить заново» ниже.',
    confirmEmailAlreadyHeading: 'Этот адрес уже зарегистрирован',
    confirmEmailAlreadyBody: (v: Vars) =>
      `${v.email} был зарегистрирован, но не подтверждён. Supabase не отправит письмо автоматически — нажмите ниже, чтобы отправить заново, или войдите, если уже подтвердили.`,
    confirmEmailResend: 'Отправить письмо заново',
    confirmEmailResending: 'Отправка…',
    confirmEmailResent: 'Письмо отправлено заново — проверьте почту.',
    confirmEmailResendFailed: (v: Vars) => `Не удалось отправить заново: ${v.msg}`,
    confirmEmailGoLogin: 'К входу',

    pwRuleLen: 'Не менее 8 символов',
    pwRuleLower: 'Строчная буква',
    pwRuleUpper: 'Заглавная буква',
    pwRuleDigit: 'Цифра',
    pwRuleSpecial: 'Спецсимвол',

    authConfigMissingTitle: 'Аутентификация не настроена',
    authConfigMissingBody:
      'Укажите Supabase URL и publishable key в .env.local и перезагрузите.',
    reloadPage: 'Перезагрузить страницу и повторить',

    signOutBtn: 'Выйти',
    roleBadgeStudent: 'Ученик',
    roleBadgeTeacher: 'Учитель',
    helloUser: (v: Vars) => `Привет, ${v.name}`,

    contextLabel: 'Контекст',
    contextSelf: 'Я сам(а)',
    contextStudent: (v: Vars) => `Ученик: ${v.name}`,
    manageStudentsBtn: 'Управлять папками учеников',
    studentManagerTitle: 'Папки учеников',
    studentManagerHint:
      'У каждого ученика своя папка. Поиски, сделанные при выбранном ученике, принадлежат только ему — удобно для отдельных экспортов и повторений.',
    studentEmpty: 'Папок учеников пока нет.',
    addStudentLabel: 'Добавить ученика',
    addStudentPlaceholder: 'Имя ученика',
    addStudentBtn: 'Добавить',
    studentRowEdit: 'Переименовать',
    studentRowDelete: 'Удалить',
    studentRowSave: 'Сохранить',
    studentRowCancel: 'Отмена',
    studentDeleteConfirm: (v: Vars) =>
      `Удалить ученика «${v.name}»? Все его записи и сессии тоже будут удалены.`,
    closeBtn: 'Закрыть',

    importLegacyTitle: 'Импортировать данные с этого устройства?',
    importLegacyBody: (v: Vars) =>
      `Найдено ${v.entries} запис(ь/и/ей) и ${v.sessions} сесси(я/и/й), сохранённых локально на этом устройстве (до вашей регистрации). Импортировать в облачный аккаунт, чтобы они были доступны на других устройствах?`,
    importLegacyConfirm: 'Импортировать в облако',
    importLegacySkip: 'Пропустить',
    importLegacyImporting: 'Импорт…',
    importLegacyDone: (v: Vars) =>
      `Импортировано: записей ${v.entries} / сессий ${v.sessions}.`,
    importLegacyFailed: (v: Vars) => `Ошибка импорта: ${v.msg}`,

    signupPromptTitle: 'Зарегистрируйтесь, чтобы создать свою базу китайского',
    signupPromptBody:
      'Вы уже можете искать слова — без регистрации. Зарегистрируйтесь, чтобы получить:',
    signupPromptBullet1: 'Запросы сохраняются в облаке и доступны на любом устройстве',
    signupPromptBullet2: 'Автоархивирование по дате / уроку, повторение и экспорт в PPT в любой момент',
    signupPromptBullet3: 'Скоро: автогенерация тестов и интервальное повторение',
    signupPromptBullet4: 'Регистрация как учитель — отдельные папки для каждого ученика',
    signupPromptCtaSignup: 'Регистрация — бесплатно',
    signupPromptCtaLogin: 'Уже есть аккаунт? Войти',
    signupPromptDismiss: 'Закрыть',

    historyAnonTitle: 'История требует аккаунта',
    historyAnonBody:
      'Анонимные поиски не сохраняются в облаке. Зарегистрируйтесь — и каждый запрос будет автоматически архивирован по дате и уроку, готов для повторения и экспорта в PPT.',
  },

  /* ─────────────────────────── Arabic ─────────────────────────── */
  ar: {
    appTitle: 'بحث سريع للصينية في الفصل',
    tabSearch: 'بحث',
    tabHistory: 'السجل والتصدير',

    pinyin: 'بينيين',
    uiLangLabel: 'اللغة',
    translateTo: 'الترجمة إلى',
    otherLang: 'أخرى…',
    otherLangWith: (v: Vars) => `أخرى: ${v.value}`,

    customLangTitle: 'لغة الترجمة المخصصة',
    customLangHint: 'أدخل اسم أي لغة (مثل «Tiếng Việt» أو «Português» أو «हिन्दी»).',
    customLangPlaceholder: 'اسم اللغة',
    cancel: 'إلغاء',
    confirm: 'موافق',

    startNewClass: '+ درس جديد',
    endClass: 'إنهاء الدرس',
    currentClass: 'الدرس',
    wordsUnit: (v: Vars) => `· ${v.n} كلمة`,
    classNamePlaceholder: 'اسم الدرس، مثل: الصينية للأعمال 3',
    start: 'ابدأ',

    searchPlaceholder: 'أدخل كلمة أو جملة بالصينية (مثل 长 / 一带一路 / 我想去中国旅行。)',
    reverseSearchPlaceholder:
      'أدخل كلمة أو جملة بأي لغة (مثل happy / je suis fatigué / «أريد السفر إلى الصين»)',
    searchBtn: 'بحث',
    searchLoading: 'جارٍ البحث…',
    searchHint: 'Enter للبحث · Shift+Enter لسطر جديد · الجمل تحصل على ترجمة فقط بدون مثال',

    dirZhToOther: 'الصينية → أخرى',
    dirOtherToZh: 'أخرى → الصينية',
    dirZhToOtherShort: 'ZH→',
    dirOtherToZhShort: '→ZH',
    targetIsChinese: '→ الصينية',
    detectedLanguage: (v: Vars) => `تم اكتشاف: ${v.lang}`,

    queryFailed: (v: Vars) => `فشل البحث: ${v.msg}`,
    emptyHint:
      'أدخل كلمة بالصينية أعلاه للبدء. تتم أرشفة الاستعلامات تلقائيًا حسب التاريخ ويمكن تصديرها كـ PPT بعد الدرس.',
    emptyHintReverse:
      'أدخل كلمة أو جملة بأي لغة، وستحصل على تعابير صينية أصيلة.',

    translatedToLine: (v: Vars) =>
      `ترجمة إلى ${v.lang} · ${v.n} معنى`,
    sentenceTranslatedTo: (v: Vars) => `ترجمة الجملة · ${v.lang}`,
    cacheHitBadge: 'مخزّن مؤقتًا',
    cacheHitTooltip:
      'هذا الإدخال موجود بالفعل في مكتبتك؛ يُعاد استخدامه فورًا دون استهلاك حصة الذكاء الاصطناعي.',
    chineseCandidatesLine: (v: Vars) =>
      `${v.lang} → الصينية · ${v.n} مرشح`,
    chineseCandidatesLineSingle: (v: Vars) => `${v.lang} → الصينية`,
    usageNote: 'متى يُستخدم',
    pronunciation: 'النطق: ',
    example: 'مثال',
    deleteRecord: 'حذف هذا السجل',
    refreshTooltip: 'إعادة البحث (تجاوز ذاكرة التخزين المؤقت)',
    previewEntryHint: 'انقر لعرض التعريف الكامل',

    registerCasual: 'عامي',
    registerColloquial: 'محكي',
    registerNeutral: 'محايد',
    registerFormal: 'رسمي',
    registerLiterary: 'فصيح',
    dirBadgeZhToOther: 'ZH→',
    dirBadgeOtherToZh: '→ZH',

    tabAll: 'الكل',
    tabByDate: 'حسب التاريخ',
    tabByClass: 'حسب الدرس',

    emptyAll: 'لا توجد استعلامات بعد. اذهب إلى «بحث» وأدخل كلمة بالصينية.',
    emptyByDate: 'لا توجد استعلامات مؤرشفة تلقائيًا اليوم.',
    emptyByClass: 'لا توجد دروس يدوية بعد. انقر «درس جديد» في الأعلى لإنشاء واحد.',

    autoArchive: 'تلقائي',
    manualClass: 'يدوي',
    ended: 'منتهٍ',
    startedAt: (v: Vars) => `بدأ ${v.time}`,
    endedAt: (v: Vars) => ` · انتهى ${v.time}`,
    deleteSessionConfirm: (v: Vars) =>
      `حذف الجلسة «${v.name}»؟ لن يتم حذف الإدخالات.`,
    delete: 'حذف',
    moreN: (v: Vars) => `+${v.n} المزيد`,

    allEntriesSub: (v: Vars) =>
      `${v.lang} · ${v.time} · ${v.n} معنى`,

    exportPptTitle: 'تصدير كـ PPT',
    exportHint:
      'اختر جلسة أو أكثر من «حسب التاريخ» أو «حسب الدرس» على اليسار، ثم انقر بالأسفل.',
    selectedSessions: (v: Vars) => `جلسات محددة: ${v.n}`,
    dedupedEntries: (v: Vars) => `إجمالي الإدخالات الفريدة: ${v.n}`,
    includePinyin: 'البينيين على الأمثلة',
    includeExampleTranslation: 'ترجمة الأمثلة',
    pptTitleLabel: 'عنوان PPT (اختياري)',
    pptTitlePlaceholder: 'اتركه فارغًا لاستخدام اسم الدرس',
    exportBtn: 'تصدير .pptx',
    exporting: 'جارٍ الإنشاء…',
    clearSelection: 'مسح التحديد',
    exportFailed: (v: Vars) => `فشل التصدير: ${v.msg}`,

    nothingToExport: 'لا توجد إدخالات للتصدير',
    pptFooterBrand: 'note.neooccidental.com · بحث سريع للصينية',
    pptEntriesCount: (v: Vars) => `${v.n} إدخال`,
    pptGroupCount: (v: Vars) => `${v.n} درس / تاريخ`,

    loginTab: 'تسجيل الدخول',
    signupTab: 'التسجيل',
    emailLabel: 'البريد الإلكتروني',
    passwordLabel: 'كلمة المرور',
    displayNameLabel: 'اسم العرض',
    roleLabel: 'أنا',
    roleStudent: 'طالب',
    roleStudentHint: 'تتبع استعلاماتي',
    roleTeacher: 'معلم',
    roleTeacherHint: 'إدارة مجلدات لطلابي',
    signInBtn: 'تسجيل الدخول',
    signingIn: 'جارٍ تسجيل الدخول…',
    signUpBtn: 'إنشاء حساب',
    signingUp: 'جارٍ إنشاء الحساب…',
    orDivider: 'أو',
    signInWithGoogle: 'تسجيل الدخول عبر Google',
    signInWithGitHub: 'تسجيل الدخول عبر GitHub',
    confirmEmailHeading: 'تحقق من بريدك',
    confirmEmailBody: (v: Vars) =>
      `أرسلنا رابط تأكيد إلى ${v.email}. انقر عليه لإكمال التسجيل.`,
    confirmEmailHint:
      'لم يصلك؟ تحقق من مجلد البريد المزعج، أو استخدم «إعادة إرسال البريد» أدناه.',
    confirmEmailAlreadyHeading: 'هذا البريد مسجّل بالفعل',
    confirmEmailAlreadyBody: (v: Vars) =>
      `${v.email} تم تسجيله سابقًا لكنه لم يُؤكَّد. لن يرسل Supabase بريدًا جديدًا تلقائيًا — انقر للإعادة، أو سجّل الدخول إذا أكدت بالفعل.`,
    confirmEmailResend: 'إعادة إرسال بريد التأكيد',
    confirmEmailResending: 'جارٍ الإرسال…',
    confirmEmailResent: 'تم إرسال البريد مجددًا — يرجى التحقق من صندوق الوارد.',
    confirmEmailResendFailed: (v: Vars) => `فشل إعادة الإرسال: ${v.msg}`,
    confirmEmailGoLogin: 'الذهاب إلى تسجيل الدخول',

    pwRuleLen: '8 أحرف على الأقل',
    pwRuleLower: 'حرف صغير',
    pwRuleUpper: 'حرف كبير',
    pwRuleDigit: 'رقم',
    pwRuleSpecial: 'رمز خاص',

    authConfigMissingTitle: 'لم يتم تكوين المصادقة',
    authConfigMissingBody:
      'حدّد Supabase URL و publishable key في .env.local وأعد التحميل.',
    reloadPage: 'إعادة تحميل الصفحة وإعادة المحاولة',

    signOutBtn: 'تسجيل الخروج',
    roleBadgeStudent: 'طالب',
    roleBadgeTeacher: 'معلم',
    helloUser: (v: Vars) => `مرحبًا، ${v.name}`,

    contextLabel: 'السياق',
    contextSelf: 'أنا',
    contextStudent: (v: Vars) => `الطالب: ${v.name}`,
    manageStudentsBtn: 'إدارة مجلدات الطلاب',
    studentManagerTitle: 'مجلدات الطلاب',
    studentManagerHint:
      'لكل طالب مجلد خاص. الاستعلامات التي تجريها أثناء اختيار طالب تخصّ ذلك الطالب فقط — ملائم للتصدير والمراجعة لكل طالب.',
    studentEmpty: 'لا توجد مجلدات طلاب بعد.',
    addStudentLabel: 'إضافة طالب',
    addStudentPlaceholder: 'اسم الطالب',
    addStudentBtn: 'إضافة',
    studentRowEdit: 'إعادة تسمية',
    studentRowDelete: 'حذف',
    studentRowSave: 'حفظ',
    studentRowCancel: 'إلغاء',
    studentDeleteConfirm: (v: Vars) =>
      `حذف الطالب «${v.name}»؟ سيتم أيضًا حذف جميع الإدخالات والجلسات الخاصة به.`,
    closeBtn: 'إغلاق',

    importLegacyTitle: 'استيراد البيانات من هذا الجهاز؟',
    importLegacyBody: (v: Vars) =>
      `وجدنا ${v.entries} إدخال و ${v.sessions} جلسة محفوظة محليًا على هذا الجهاز (من قبل التسجيل). هل تريد استيرادها إلى حسابك السحابي لتكون متاحة على الأجهزة الأخرى؟`,
    importLegacyConfirm: 'استيراد إلى السحابة',
    importLegacySkip: 'تخطي',
    importLegacyImporting: 'جارٍ الاستيراد…',
    importLegacyDone: (v: Vars) =>
      `تم استيراد ${v.entries} إدخال / ${v.sessions} جلسة.`,
    importLegacyFailed: (v: Vars) => `فشل الاستيراد: ${v.msg}`,

    signupPromptTitle: 'سجّل لبناء قاعدة معرفتك بالصينية',
    signupPromptBody:
      'يمكنك البحث عن الكلمات الآن — دون تسجيل دخول. التسجيل يفتح لك:',
    signupPromptBullet1: 'استعلامات محفوظة في السحابة، متاحة على أي جهاز',
    signupPromptBullet2: 'أرشفة تلقائية حسب التاريخ / الدرس، مراجعة وتصدير PPT في أي وقت',
    signupPromptBullet3: 'قريبًا: اختبارات تلقائية ومراجعة متباعدة',
    signupPromptBullet4: 'سجّل كمعلم لإدارة مجلدات منفصلة لكل طالب',
    signupPromptCtaSignup: 'تسجيل — مجاني',
    signupPromptCtaLogin: 'لديك حساب بالفعل؟ تسجيل الدخول',
    signupPromptDismiss: 'إغلاق',

    historyAnonTitle: 'يتطلب السجل حسابًا',
    historyAnonBody:
      'الاستعلامات المجهولة لا تُحفظ في السحابة. سجّل، وستُؤرشف كل استعلاماتك تلقائيًا حسب التاريخ والدرس، جاهزة للمراجعة والتصدير إلى PPT.',
  },
} as const satisfies Record<UILang, Record<string, string | ((v: Vars) => string)>>;

/** All keys come from the English locale, which is the new default. */
export type StringKey = keyof (typeof DICT)['en'];

export function translate(lang: UILang, key: StringKey, vars?: Vars): string {
  // Fallback to English when a key is missing or a locale dict is incomplete.
  const entry = DICT[lang][key] ?? DICT.en[key];
  return typeof entry === 'function' ? entry(vars ?? {}) : entry;
}
