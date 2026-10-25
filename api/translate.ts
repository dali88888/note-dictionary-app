/**
 * POST /api/translate
 * Body: {
 *   word: string,
 *   language: string,                                    // ignored when direction = "other-to-zh"
 *   direction?: "zh-to-other" | "other-to-zh"            // default "zh-to-other"
 * }
 * Response: TranslateResponse (JSON) — see src/types/dictionary.ts
 *
 * Runs on Vercel Edge Runtime.  Gemini is called with fetch directly;
 * Claude through the official @anthropic-ai/sdk.
 * AI_PROVIDER ("gemini" | "claude", default "gemini") picks the primary
 * provider; the other one is the automatic backup when its key
 * (GEMINI_API_KEY / ANTHROPIC_API_KEY) is set.
 *
 * GET /api/translate?health=1 — live check of each configured provider.
 *
 * Error responses: { error, errorCode, detail } — see summarizeAiFailures.
 */

import Anthropic from '@anthropic-ai/sdk';

export const config = { runtime: 'edge' };

type Direction = 'zh-to-other' | 'other-to-zh';

interface TranslateRequest {
  word: string;
  language: string;
  direction?: Direction;
  /**
   * When true, bypass the global L2 cache (`dictionary_cache`):
   *   - skip the SELECT lookup → always call the AI
   *   - on store, UPSERT (Prefer: resolution=merge-duplicates) so the
   *     freshly-generated payload OVERWRITES any stale cached entry
   *     for the same (direction, word_normalized, language) key.
   *
   * Used by the "Refresh" button on the result card so users can
   * regenerate an answer when the cached one looks wrong (e.g. AI
   * returned bad pinyin or an example that doesn't contain the
   * queried word).  Without this, a bad row in the global cache
   * would keep being served on every subsequent query.
   */
  force?: boolean;
}

// Mirror of TranslateResponse — duplicated here so the API package has no
// dependency on src/. The shapes MUST stay in sync with src/types/dictionary.ts.
interface ApiSyllable { hanzi: string; pinyin: string }
interface ApiMeaning {
  partOfSpeech: string;
  pinyin?: string;
  hanziSyllables?: ApiSyllable[];
  register?: 'casual' | 'colloquial' | 'neutral' | 'formal' | 'literary';
  definition: string;
  example: { chinese: ApiSyllable[]; translation: string };
}
interface ApiResponse {
  word: string;
  direction?: Direction;
  wordSyllables: ApiSyllable[];
  language: string;
  meanings: ApiMeaning[];
  /**
   * True when the response was served from the global dictionary_cache
   * (i.e. some earlier request — possibly from a different user — had
   * already paid the AI cost for this exact (word, language, direction)).
   * Drives the "⚡ 已缓存" badge on the client; absent or false on cache
   * miss.
   */
  _fromCache?: boolean;
}

/* ────────────────────────────────────────────────────────────────
 * Prompts
 * ─────────────────────────────────────────────────────────────── */

const FORWARD_PROMPT = (word: string, language: string) => `你是一位专业的中文词典编辑，为非母语学习者编写词条。

输入内容：
"""
${word}
"""
翻译目标语言为 ${language}。

【最高优先级 · 全文使用简体字 (Simplified Chinese / 普通话标准简化字)】
本工具面向简体中文教学。**所有汉字输出（wordSyllables、example.chinese 的每个 hanzi、definition 中提到的任何中文）必须使用简体字，绝对不允许出现繁体字或任何变体字**。
即使用户输入是繁体字，也按对应的简体写法输出。常见对照（左繁右简，必须使用右侧）：
  個→个  們→们  學→学  國→国  來→来  這→这  那（不变）  麼→么  沒→没  體→体
  說→说  覺→觉  關→关  時→时  會→会  幾→几  愛→爱  漢→汉  語→语  書→书
  間→间  問→问  寫→写  讀→读  錢→钱  飯→饭  電→电  話→话  車→车（含开车的"车"）
  廠→厂  廣→广  專→专  島→岛  萬→万  與→与  從→从  變→变  網→网  動→动
任何含繁体字的输出视为格式错误，请逐字检查后再返回。

第一步 · 判断输入类型：
- 如果是 SINGLE WORD / PHRASE（单字、词、固定短语，如"好"、"打"、"一带一路"），按"词条模式"输出。
- 如果是 FULL SENTENCE / CLAUSE（完整句子或带标点的整段文字，如"今天天气真好。"或多个句子拼接），按"整句翻译模式"输出。

【词条模式】严格要求：
1. 列出所有常用含义与词性，每个单独作为一个 meaning 对象。
2. 如果一个词由于读音不同对应不同含义（多音字 / 多音词），**必须**为每个读音单独建立一个 meaning 对象，并在该对象的 pinyin 字段中填写该义项的真实读音。同一个汉字组合下不同的读音 = 不同的 meaning，绝不允许把它们合并到一个 meaning 中或共用同一个 pinyin。
   示例："东西"有两个读法，对应两个完全不同的义项，必须各自单独成为一个 meaning：
     • pinyin "dōng xi"（西轻声）→ "thing / object / stuff"
     • pinyin "dōng xī"（西一声）→ "east and west / the directions east and west"
   再如："长"在 "长大" 中读 "zhǎng"（动词，生长），在 "长江" 中读 "cháng"（形容词，长的）—— 必须给出两个 meaning。
3. **拼音必须反映该义项的真实标准普通话读音，包括轻声（neutral tone）。轻声音节不带声调符号**：
     • "朋友" → "péng you"（友为轻声，无调号）； 错误："péng yǒu"
     • "妈妈" → "mā ma"（第二个 ma 为轻声）； "衣服" → "yī fu"； "先生" → "xiān sheng"
     • "东西"（thing 义） → "dōng xi"； 错误："dōng xī" 或 "dōng xǐ"
     • 凡是该字在普通话中读轻声的义项，pinyin 字段必须写作不带调号的形式。
4. **每个 meaning 必须提供一个自然、地道的中文例句**，并且：
     ★ 例句中**必须把被查询的"${word}"按原样写出**（连续子串，原字一字不差）。允许在例句中加入其他成分，但绝不允许只出现"${word}"的一部分、同义改写、或省略某个字。
     ★ 例句应清楚体现该 meaning 的具体用法 —— 例如"天"作"日子/时间"义时，例句不能只是写一个气象场景，而要在例句中真正用"天"表达"日子"的意思（如"过了几天"、"那天我去了…"）。
     ★ 不同 meaning 的例句应使用不同语境，避免雷同。
     ★ **example.translation 必须是中文例句的"直译" / literal translation，不是意译**。本工具的核心用途是给二语学习者建立中文词 ↔ 目标语词的一一对应；意译会让学生看不出哪个中文词对应哪个目标语词。具体规则：
       (a) 中文里每个实词（动词、名词、形容词、副词）必须能在译文中找到对应的目标语词，**词性保持一致**。中文是动词的，译文里也应是动词；中文是名词的，译文里也应是名词。
       (b) **错误意译示例**（不要这样译）：中文"明天我去健身。" → "I am going to the gym tomorrow."  ← "健身"在中文里是动词（to work out），却被译成了名词"the gym"；学生看不出"健身"对应哪个英文词。
       (c) **正确直译示例**：中文"明天我去健身。" → "Tomorrow I go to work out." 或 "Tomorrow I will go work out."  ← "明天=tomorrow, 我=I, 去=go, 健身=work out"，词对词、词性对词性。
       (d) 再举一例：中文"她在做饭。" → 正确："She is making food." 或 "She is cooking food."  错误："She is cooking."（"饭"没有对应词，丢了对应关系）
       (e) 在不严重违反目标语法的前提下，**优先词序、词性、词数对应**；只有当严格直译会导致语法明显错误时，才允许微调，且要尽量保留对应关系。
       (f) 中文虚词（了、的、吗、呢、得、过、着 等结构助词/语气助词）不强制对应 —— 这些词在很多目标语里没有直接对等物，按目标语习惯处理即可。
5. 例句拆分为 Syllable 数组（见下方"Syllable 拆分规则"）。
6. wordSyllables 同样按 Syllable 拆分规则给出该词的主拼音读法（多音字取最常用，且包含轻声标注）。
7. partOfSpeech、definition、example.translation 全部使用 ${language} 书写。
8. pinyin 使用带声调的带调标字母（例如 "hǎo"、"zhōng"、"cháng"），不要使用数字声调；轻声音节一律不带任何调号（写 "ma" 而非 "mǎ"）。

【整句翻译模式】严格要求：
1. 只输出**一个** meaning 对象，不要列多个。
2. partOfSpeech 字段填写 "sentence"（保持英文小写，目标语言为非英文时也写 "sentence"，前端用它来识别整句模式）。
3. definition 字段填写整段输入的最佳地道翻译，使用 ${language} 书写。
4. **不要**生成例句——把 example 设为：{ "chinese": [], "translation": "" }（空数组、空字符串）。
5. wordSyllables 按 Syllable 拆分规则给出原中文输入的逐字拼音（用于在结果页顶部展示原句加拼音）。标点 pinyin 填 ""。
6. pinyin 使用带声调字母。

【Syllable 拆分规则】（极其重要，必须严格遵守）：
- **每个汉字单独占一个 Syllable 对象**，绝对不允许把多个汉字塞进同一个 hanzi 字段。
- 标点符号（，。！？、"" 等）也单独占一个 Syllable，但 pinyin 字段填空字符串 ""。
- 非汉字字符（空格、字母、数字）也单独占一个 Syllable，pinyin 填 ""。

✅ 正确示例（"我是中国人。"）：
[
  {"hanzi":"我","pinyin":"wǒ"},
  {"hanzi":"是","pinyin":"shì"},
  {"hanzi":"中","pinyin":"zhōng"},
  {"hanzi":"国","pinyin":"guó"},
  {"hanzi":"人","pinyin":"rén"},
  {"hanzi":"。","pinyin":""}
]

❌ 错误示例（绝对不要这样输出）：
- [{"hanzi":"我是","pinyin":"wǒ shì"}, ...]            ← 把两个字塞进同一个对象
- [{"hanzi":"中国人","pinyin":"zhōng guó rén"}]         ← 三个字塞进一个对象
- [{"hanzi":"中国","pinyin":"zhōng"}]                   ← pinyin 缺漏只覆盖部分字
- [{"hanzi":"朋友","pinyin":"péngyǒu"}]                 ← 即使是常见词也要拆开

通用：
- 只返回 JSON，严格符合提供的 schema，不要添加任何其他文字。`;

const REVERSE_PROMPT = (word: string) => `You are an expert Chinese language teacher who helps non-native learners find idiomatic Chinese expressions. The learner can input a word, phrase, or full sentence in ANY language (or even a mix of multiple languages, e.g. English + Japanese, or English with some Chinese inserted).

The learner's input is:
"""
${word}
"""

★ TOP PRIORITY — SIMPLIFIED CHINESE ONLY (简体字) ★
This tool teaches Simplified Chinese (Mainland Mandarin standard).
EVERY Chinese character you emit — in hanziSyllables, in
example.chinese, and anywhere in definition — MUST be the
Simplified form.  Traditional (繁體) or variant forms are NEVER
acceptable.  Common left-trad → right-simp pairs (always use the
right side): 個→个, 們→们, 學→学, 國→国, 來→来, 這→这, 麼→么,
沒→没, 體→体, 說→说, 覺→觉, 關→关, 時→时, 會→会, 幾→几,
愛→爱, 漢→汉, 語→语, 書→书, 間→间, 問→问, 寫→写, 讀→读,
錢→钱, 飯→饭, 電→电, 話→话, 車→车, 廠→厂, 廣→广, 萬→万,
與→与, 從→从, 變→变, 網→网, 動→动.
Even if the source-language input contains traditional Chinese
characters, convert them to Simplified in your output.


Tasks:
1. Auto-detect the source language(s). Set the "language" field to the language name (e.g. "English", "Français", "日本語"). If the input is mixed, write something like "Mixed: English + Japanese". Use the language's own native name when possible.
2. Decide whether the input is a SINGLE WORD/PHRASE or a FULL SENTENCE:
   - WORD/PHRASE → produce 2-5 distinct Chinese candidate translations as separate meaning objects, ordered from most common/neutral to more marked. The whole point is to help the learner pick the right one for the situation.
   - FULL SENTENCE → produce exactly ONE meaning containing the single best idiomatic Chinese rendering, AND skip the example (see field rules below).
3. For each meaning fill these fields:
   - partOfSpeech: written in the SOURCE LANGUAGE (e.g. "adjective", "verb", "expression", "形容詞"). For FULL SENTENCE inputs, set this to the literal string "sentence" (lowercase, English) so the frontend can detect sentence-translation mode.
   - register: REQUIRED, one of "casual" (slangy/informal), "colloquial" (everyday spoken), "neutral" (works anywhere), "formal" (official/business), "literary" (written/poetic/classical-flavored)
   - hanziSyllables: the Chinese candidate broken per-character. Each entry { hanzi, pinyin }. See "Syllable splitting rules" below — the same rules apply to BOTH hanziSyllables and example.chinese.
   - definition: 1-2 sentences IN THE SOURCE LANGUAGE explaining the nuance — when to use this candidate, what register/situation it fits, and how it differs from the other candidates. Be concrete; mention spoken vs written, formality, emotional tone, regional usage when relevant. For FULL SENTENCE inputs, this field is optional usage notes (you may leave it as a 1-sentence remark or empty).
   - example:
       For WORD/PHRASE inputs: { chinese, translation }
         chinese: a natural, idiomatic Chinese sentence USING THIS CANDIDATE, broken per-character with pinyin.
           ★ STRICT: the example MUST contain the candidate's hanzi (the value of hanziSyllables joined together) as a contiguous substring — written exactly the same way, character for character. Do NOT replace it with a synonym or write only part of it.
         translation: that sentence's equivalent in the SOURCE LANGUAGE.
           ★ The translation MUST be a LITERAL / word-for-word translation of the Chinese sentence, NOT a free / idiomatic one.  This tool's core use is helping second-language learners see the one-to-one mapping between Chinese words and source-language words; idiomatic translations hide which Chinese word maps to which source-language word.  Specific rules:
             (a) Every content word in the Chinese (verb, noun, adjective, adverb) must have a corresponding word in the translation, and the PART OF SPEECH must match — a Chinese verb is rendered as a verb in the source language, a Chinese noun as a noun, etc.
             (b) WRONG (idiomatic): Chinese "明天我去健身。" → "I am going to the gym tomorrow."  ← 健身 is a verb (to work out), but it got rendered as the noun "the gym"; the learner can't see which English word corresponds to 健身.
             (c) RIGHT (literal): Chinese "明天我去健身。" → "Tomorrow I go to work out."  ← 明天=tomorrow, 我=I, 去=go, 健身=work out; word-for-word, part-of-speech for part-of-speech.
             (d) Another example: Chinese "她在做饭。" — RIGHT: "She is making food." or "She is cooking food."  WRONG: "She is cooking." (饭 has no corresponding word; the learner loses the mapping).
             (e) Prioritize word-order, part-of-speech, and word-count correspondence UNLESS strict literal would produce an outright ungrammatical sentence in the source language; only then minimally adjust, and preserve as much correspondence as possible.
             (f) Chinese function particles (了, 的, 吗, 呢, 得, 过, 着 etc.) are NOT required to have direct counterparts — many source languages have no equivalent and handling them per the source language's normal grammar is fine.
       For FULL SENTENCE inputs: set example to { "chinese": [], "translation": "" } — empty arrays/strings, no example needed because the candidate IS the translation already.
4. Top-level fields:
   - word: echo the learner's original input verbatim.
   - wordSyllables: ALWAYS return an empty array [] (the learner did not input Chinese — there's nothing to syllabify on the input side).
   - language: detected source language as described above.

Pinyin must reflect the actual standard Mandarin reading of each character in context, INCLUDING NEUTRAL TONE (轻声).
- Tone-marked vowels for tones 1–4: "hǎo", "zhōng", "shén", "cháng".
- For neutral-tone syllables, write the vowels WITHOUT any tone mark — e.g.
    "朋友" → "péng you" (友 is neutral; not "yǒu")
    "妈妈" → "mā ma"
    "东西" (meaning 'thing/object') → "dōng xi" (西 is neutral; not "xī")
    "先生" → "xiān sheng"
- Never use numeric tones.
- If a single hanzi has multiple readings that map to different meanings (e.g. 东西 dōngxi 'thing' vs dōngxī 'east and west'), each meaning MUST get its own meaning object with the correct pinyin for that meaning — do NOT collapse them.

Syllable splitting rules (CRITICAL — must be followed exactly for both hanziSyllables and example.chinese):
- ONE Chinese character per Syllable object.  Never group multiple characters under a single hanzi field.
- Punctuation (，。！？、 etc.) gets its own Syllable with pinyin: "".
- Non-Chinese characters (spaces, letters, digits) each get their own Syllable with pinyin: "".

✅ CORRECT (for "我是中国人。"):
[
  {"hanzi":"我","pinyin":"wǒ"},
  {"hanzi":"是","pinyin":"shì"},
  {"hanzi":"中","pinyin":"zhōng"},
  {"hanzi":"国","pinyin":"guó"},
  {"hanzi":"人","pinyin":"rén"},
  {"hanzi":"。","pinyin":""}
]

❌ WRONG (NEVER produce these):
- [{"hanzi":"我是","pinyin":"wǒ shì"}, ...]          ← two characters in one entry
- [{"hanzi":"中国人","pinyin":"zhōng guó rén"}]       ← three characters in one entry
- [{"hanzi":"朋友","pinyin":"péngyǒu"}]               ← common word still must be split
- [{"hanzi":"中国","pinyin":"zhōng"}]                 ← pinyin missing for trailing chars

Return ONLY JSON, strictly conforming to the provided schema. No explanatory text outside the JSON.`;

/* ────────────────────────────────────────────────────────────────
 * Schemas
 * ─────────────────────────────────────────────────────────────── */

const SYLLABLE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    hanzi: { type: 'STRING' },
    pinyin: { type: 'STRING' },
  },
  required: ['hanzi', 'pinyin'],
} as const;

const FORWARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    word: { type: 'STRING' },
    language: { type: 'STRING' },
    wordSyllables: { type: 'ARRAY', items: SYLLABLE_SCHEMA },
    meanings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          partOfSpeech: { type: 'STRING' },
          pinyin: { type: 'STRING' },
          definition: { type: 'STRING' },
          example: {
            type: 'OBJECT',
            properties: {
              chinese: { type: 'ARRAY', items: SYLLABLE_SCHEMA },
              translation: { type: 'STRING' },
            },
            required: ['chinese', 'translation'],
          },
        },
        required: ['partOfSpeech', 'definition', 'example'],
      },
    },
  },
  required: ['word', 'language', 'wordSyllables', 'meanings'],
} as const;

const REVERSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    word: { type: 'STRING' },
    language: { type: 'STRING' },
    wordSyllables: { type: 'ARRAY', items: SYLLABLE_SCHEMA },
    meanings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          partOfSpeech: { type: 'STRING' },
          register: {
            type: 'STRING',
            enum: ['casual', 'colloquial', 'neutral', 'formal', 'literary'],
          },
          hanziSyllables: { type: 'ARRAY', items: SYLLABLE_SCHEMA },
          definition: { type: 'STRING' },
          example: {
            type: 'OBJECT',
            properties: {
              chinese: { type: 'ARRAY', items: SYLLABLE_SCHEMA },
              translation: { type: 'STRING' },
            },
            required: ['chinese', 'translation'],
          },
        },
        required: [
          'partOfSpeech',
          'register',
          'hanziSyllables',
          'definition',
          'example',
        ],
      },
    },
  },
  required: ['word', 'language', 'wordSyllables', 'meanings'],
} as const;

/* ────────────────────────────────────────────────────────────────
 * AI providers
 * ─────────────────────────────────────────────────────────────── */

/**
 * Provider chain: the primary provider (AI_PROVIDER, default gemini)
 * runs first; the other provider, when its API key is configured, is
 * the automatic backup.  So with both GEMINI_API_KEY and
 * ANTHROPIC_API_KEY set, a Gemini outage or an empty Gemini balance is
 * invisible to users — Claude answers instead.
 *
 * Every upstream failure is classified (see AiErrorKind) because the
 * right reaction differs:
 *   • billing / auth — permanent until a human fixes the account.  No
 *     retries (retrying a 402 just burns the time budget — that's how
 *     the "Gemini 高峰期 … 请过 30 秒后再查询" message used to appear
 *     when the real cause was an empty prepaid balance).  The provider
 *     is also put on a short cooldown so later requests in the same
 *     isolate go to the backup first.
 *   • rate_limit / transient — worth a retry within the time budget,
 *     then the backup provider.
 *   • bad_output / other — no retry on the same provider; try the
 *     backup.
 *
 * Gemini keeps its two tiers for transient failures: retries on
 * gemini-2.5-flash, then one shot on gemini-2.5-flash-lite (separate
 * capacity pool, comparable quality for dictionary lookups).
 */
const GEMINI_PRIMARY_MODEL = 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-lite';
const CLAUDE_MODEL = 'claude-haiku-5-5';

type AiProvider = 'gemini' | 'claude';
type AiErrorKind =
  | 'billing'
  | 'auth'
  | 'rate_limit'
  | 'transient'
  | 'bad_output'
  | 'other';

/**
 * Time budget.  The client aborts at 35 s, so the whole chain must
 * finish well before that.  When a backup provider exists, the primary
 * only gets `primaryShareMs` so the backup still has room to answer.
 * Mutable (not `as const`) so tests can shrink the delays.
 */
export const AI_TIMING = {
  overallBudgetMs: 26_000,
  primaryShareMs: 12_000,
  minAttemptMs: 3_000,
  geminiRetryDelaysMs: [1500, 3500],
  claudeRetryDelaysMs: [1000],
  cooldownMs: 5 * 60_000,
};

const PROVIDER_LABEL: Record<AiProvider, string> = {
  gemini: 'Gemini',
  claude: 'Claude',
};

export class AiProviderError extends Error {
  constructor(
    public provider: AiProvider,
    public kind: AiErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

function isRetryable(kind: AiErrorKind): boolean {
  return kind === 'transient' || kind === 'rate_limit';
}

/**
 * Classify a non-2xx Gemini response.  Gemini reports an empty prepaid
 * balance as HTTP 402 with status "RESOURCE_EXHAUSTED" — the same
 * status string it uses for rate limits — so the HTTP code and the
 * message must be checked before the status string.
 */
export function classifyGeminiHttpError(status: number, body: string): AiErrorKind {
  if (
    status === 402 ||
    /prepayment credits|credits are depleted|BILLING_DISABLED|requires billing/i.test(body)
  ) {
    return 'billing';
  }
  if (
    status === 401 ||
    status === 403 ||
    /API_KEY_INVALID|API key not valid|API key expired/i.test(body)
  ) {
    return 'auth';
  }
  if (status === 429) return 'rate_limit';
  if (status >= 500 || /UNAVAILABLE|OVERLOADED|DEADLINE_EXCEEDED/.test(body)) {
    return 'transient';
  }
  return 'other';
}

export function classifyClaudeError(err: unknown): AiErrorKind {
  // Connection / timeout / abort errors are APIError subclasses with
  // status undefined, so they must be checked before the status checks.
  if (err instanceof Anthropic.APIConnectionError) return 'transient';
  if (err instanceof Anthropic.APIUserAbortError) return 'transient';
  if (err instanceof Anthropic.APIError) {
    if (err.status === 402 || err.type === 'billing_error') return 'billing';
    if (
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError
    ) {
      return 'auth';
    }
    if (err instanceof Anthropic.RateLimitError) return 'rate_limit';
    if (err instanceof Anthropic.InternalServerError) return 'transient';
    return 'other';
  }
  return 'bad_output';
}

/**
 * Billing / auth failures don't fix themselves, so for a few minutes
 * the failing provider is moved to the back of the chain.  Module
 * state lives per Edge isolate — best effort, which is all it needs
 * to be: it only saves latency, never changes the answer.
 */
const providerCooldownUntil: Partial<Record<AiProvider, number>> = {};

export function __resetAiStateForTests(): void {
  for (const k of Object.keys(providerCooldownUntil) as AiProvider[]) {
    delete providerCooldownUntil[k];
  }
}

function configuredProviders(): AiProvider[] {
  const primary: AiProvider =
    (process.env.AI_PROVIDER || 'gemini').toLowerCase() === 'claude' ? 'claude' : 'gemini';
  const order: AiProvider[] = primary === 'claude' ? ['claude', 'gemini'] : ['gemini', 'claude'];
  return order.filter((p) => !!providerKey(p));
}

function providerKey(p: AiProvider): string | undefined {
  return p === 'claude' ? process.env.ANTHROPIC_API_KEY : process.env.GEMINI_API_KEY;
}

function orderByCooldown(providers: AiProvider[]): AiProvider[] {
  const now = Date.now();
  const cooling = (p: AiProvider) => (providerCooldownUntil[p] ?? 0) > now;
  return [...providers.filter((p) => !cooling(p)), ...providers.filter(cooling)];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `steps` in order until one succeeds.  A non-retryable failure
 * ends the run immediately; a retryable one moves on to the next step
 * if the deadline still leaves room for it.
 */
async function runSteps(
  provider: AiProvider,
  steps: Array<{ delayMs: number; label: string; call: (timeoutMs: number) => Promise<ApiResponse> }>,
  deadline: number,
): Promise<ApiResponse> {
  let lastErr: AiProviderError | undefined;
  for (const [i, step] of steps.entries()) {
    if (i > 0) {
      if (deadline - Date.now() < step.delayMs + AI_TIMING.minAttemptMs) break;
      if (step.delayMs > 0) await sleep(step.delayMs);
    }
    const timeoutMs = Math.max(deadline - Date.now(), 1000);
    try {
      return await step.call(timeoutMs);
    } catch (err) {
      lastErr =
        err instanceof AiProviderError
          ? err
          : new AiProviderError(provider, 'other', err instanceof Error ? err.message : String(err));
      // eslint-disable-next-line no-console
      console.warn(
        `[ai] ${step.label} failed (${lastErr.kind}${lastErr.status ? `, HTTP ${lastErr.status}` : ''}): ${lastErr.message.slice(0, 300)}`,
      );
      if (!isRetryable(lastErr.kind)) throw lastErr;
    }
  }
  throw lastErr ?? new AiProviderError(provider, 'transient', `${PROVIDER_LABEL[provider]} 未在时限内完成`);
}

function runGemini(prompt: string, schema: object, apiKey: string, deadline: number) {
  return runSteps(
    'gemini',
    [
      {
        delayMs: 0,
        label: `gemini ${GEMINI_PRIMARY_MODEL} attempt 1`,
        call: (t) => callGemini(GEMINI_PRIMARY_MODEL, prompt, schema, apiKey, t),
      },
      ...AI_TIMING.geminiRetryDelaysMs.map((delayMs, i) => ({
        delayMs,
        label: `gemini ${GEMINI_PRIMARY_MODEL} attempt ${i + 2}`,
        call: (t: number) => callGemini(GEMINI_PRIMARY_MODEL, prompt, schema, apiKey, t),
      })),
      {
        delayMs: 0,
        label: `gemini ${GEMINI_FALLBACK_MODEL}`,
        call: (t) => callGemini(GEMINI_FALLBACK_MODEL, prompt, schema, apiKey, t),
      },
    ],
    deadline,
  );
}

function runClaude(prompt: string, schema: object, apiKey: string, deadline: number) {
  return runSteps(
    'claude',
    [0, ...AI_TIMING.claudeRetryDelaysMs].map((delayMs, i) => ({
      delayMs,
      label: `claude ${CLAUDE_MODEL} attempt ${i + 1}`,
      call: (t: number) => callClaude(prompt, schema, apiKey, t),
    })),
    deadline,
  );
}

type ChainResult =
  | { ok: true; result: ApiResponse; provider: AiProvider; failures: AiProviderError[] }
  | { ok: false; failures: AiProviderError[]; configured: AiProvider[] };

async function translateWithProviders(prompt: string, schema: object): Promise<ChainResult> {
  const configured = configuredProviders();
  const chain = orderByCooldown(configured);
  const overallDeadline = Date.now() + AI_TIMING.overallBudgetMs;
  const failures: AiProviderError[] = [];

  for (const [i, provider] of chain.entries()) {
    const isLast = i === chain.length - 1;
    const deadline = isLast
      ? overallDeadline
      : Math.min(overallDeadline, Date.now() + AI_TIMING.primaryShareMs);
    if (deadline - Date.now() < AI_TIMING.minAttemptMs) {
      failures.push(new AiProviderError(provider, 'transient', `没有足够的剩余时间调用 ${PROVIDER_LABEL[provider]}`));
      continue;
    }
    const key = providerKey(provider) as string;
    try {
      const result =
        provider === 'claude'
          ? await runClaude(prompt, schema, key, deadline)
          : await runGemini(prompt, schema, key, deadline);
      delete providerCooldownUntil[provider];
      if (failures.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[ai] served by backup ${provider} after: ${failures.map((f) => `${f.provider}=${f.kind}`).join(', ')}`,
        );
      }
      return { ok: true, result, provider, failures };
    } catch (err) {
      const e =
        err instanceof AiProviderError
          ? err
          : new AiProviderError(provider, 'other', err instanceof Error ? err.message : String(err));
      failures.push(e);
      if (e.kind === 'billing' || e.kind === 'auth') {
        providerCooldownUntil[provider] = Date.now() + AI_TIMING.cooldownMs;
      }
    }
  }
  return { ok: false, failures, configured };
}

const KIND_ZH: Record<AiErrorKind, string> = {
  billing: '预付费额度已用完',
  auth: 'API 密钥无效或已过期',
  rate_limit: '请求过于频繁或配额已达上限',
  transient: '服务繁忙或超时',
  bad_output: '返回内容格式错误',
  other: '调用失败',
};
const KIND_EN: Record<AiErrorKind, string> = {
  billing: 'out of credits',
  auth: 'invalid API key',
  rate_limit: 'rate limited',
  transient: 'busy or timed out',
  bad_output: 'malformed response',
  other: 'request failed',
};

export type AiErrorCode = 'AI_BUSY' | 'AI_BILLING' | 'AI_AUTH' | 'AI_FAILED';

const CODE_HEADLINE_ZH: Record<AiErrorCode, string> = {
  AI_BILLING:
    'AI 翻译服务的额度已用完，暂时无法查询新的词（之前查过的词仍可正常使用）。请联系网站管理员充值。',
  AI_AUTH: 'AI 翻译服务配置有误（API 密钥无效或已过期），暂时无法查询。请联系网站管理员检查配置。',
  AI_BUSY: 'AI 翻译服务暂时繁忙，请稍后再试。',
  AI_FAILED: 'AI 翻译失败，请重试或换一种说法。',
};

/**
 * Turn the chain's failures into one user-facing error.  The headline
 * follows the most actionable cause: if any provider was merely busy,
 * retrying can work, so say "busy"; otherwise billing beats auth beats
 * everything else.  The per-provider detail is always included, so an
 * empty balance stays visible even when the headline is "busy".
 */
export function summarizeAiFailures(
  failures: AiProviderError[],
  configured: AiProvider[],
): { code: AiErrorCode; message: string; detail: string } {
  const kinds = new Set(failures.map((f) => f.kind));
  const code: AiErrorCode =
    kinds.has('transient') || kinds.has('rate_limit')
      ? 'AI_BUSY'
      : kinds.has('billing')
        ? 'AI_BILLING'
        : kinds.has('auth')
          ? 'AI_AUTH'
          : 'AI_FAILED';

  const http = (f: AiProviderError) => (f.status ? ` (HTTP ${f.status})` : '');
  const zhParts = failures.map((f) => `${PROVIDER_LABEL[f.provider]}：${KIND_ZH[f.kind]}${http(f)}`);
  const enParts = failures.map((f) => `${PROVIDER_LABEL[f.provider]}: ${KIND_EN[f.kind]}${http(f)}`);
  if (configured.length === 1) {
    zhParts.push('未配置备用 AI');
    enParts.push('no backup AI configured');
  }
  return {
    code,
    message: `${CODE_HEADLINE_ZH[code]}（${zhParts.join('；')}）`,
    detail: enParts.join(' · '),
  };
}

async function callGemini(
  model: string,
  prompt: string,
  schema: object,
  apiKey: string,
  timeoutMs: number,
): Promise<ApiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.3,
      // Disable Gemini 2.5's "thinking" mode.  By default, gemini-2.5-flash
      // burns 5–15 s of latency on internal reasoning tokens before it
      // streams output — useful for math/code, useless for dictionary
      // lookups whose output is constrained by a JSON schema and whose
      // "reasoning" is just pattern recall.  Setting thinkingBudget=0
      // brings typical response time down from ~14 s to ~2 s without
      // any observable quality loss for our prompts.
      // Docs: https://ai.google.dev/gemini-api/docs/thinking
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new AiProviderError(
      'gemini',
      'transient',
      timedOut
        ? `Gemini ${model} 超时（${Math.round(timeoutMs / 1000)}s）`
        : `Gemini 网络错误：${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AiProviderError(
      'gemini',
      classifyGeminiHttpError(res.status, text),
      `Gemini API ${res.status}: ${text.slice(0, 300)}`,
      res.status,
    );
  }

  let text: string | undefined;
  try {
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch (err) {
    // The body stream can also be cut off by the timeout signal.
    throw new AiProviderError('gemini', 'transient', `Gemini 响应读取失败：${String(err)}`);
  }
  if (!text) throw new AiProviderError('gemini', 'bad_output', 'Gemini 返回了空内容');
  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    throw new AiProviderError('gemini', 'bad_output', `Gemini 返回的不是合法 JSON：${text.slice(0, 120)}`);
  }
}

/**
 * Convert one of the Gemini-dialect schemas above (upper-case `type`)
 * to the JSON Schema that Claude's structured outputs expect, which
 * also requires `additionalProperties: false` on every object.
 * Exported for unit testing.
 */
export function toClaudeJsonSchema(schema: unknown): Record<string, unknown> {
  const s = schema as {
    type?: string;
    properties?: Record<string, unknown>;
    items?: unknown;
    required?: readonly string[];
    enum?: readonly string[];
  };
  const out: Record<string, unknown> = {};
  if (s.type) out.type = s.type.toLowerCase();
  if (s.enum) out.enum = [...s.enum];
  if (s.properties) {
    out.properties = Object.fromEntries(
      Object.entries(s.properties).map(([k, v]) => [k, toClaudeJsonSchema(v)]),
    );
  }
  if (s.required) out.required = [...s.required];
  if (s.items) out.items = toClaudeJsonSchema(s.items);
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

async function callClaude(
  prompt: string,
  schema: object,
  apiKey: string,
  timeoutMs: number,
): Promise<ApiResponse> {
  // Retries are driven by runSteps so they respect the request deadline.
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: timeoutMs });

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      // Structured outputs guarantee the text block is valid JSON for the
      // schema.  Low effort keeps latency down for a lookup task.
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: toClaudeJsonSchema(schema) },
      },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    throw new AiProviderError(
      'claude',
      classifyClaudeError(err),
      `Claude API: ${err instanceof Error ? err.message : String(err)}`.slice(0, 400),
      err instanceof Anthropic.APIError ? err.status : undefined,
    );
  }

  if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
    throw new AiProviderError('claude', 'bad_output', `Claude 输出未完成（stop_reason=${message.stop_reason}）`);
  }
  const text = message.content.find((b) => b.type === 'text')?.text ?? '';
  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    throw new AiProviderError('claude', 'bad_output', `Claude 返回的不是合法 JSON：${text.slice(0, 120)}`);
  }
}

/**
 * Live check of each configured provider, so the site owner can
 * confirm a key works (and has credits) after changing it:
 * GET /api/translate?health=1.  Each provider independently runs one
 * real lookup ("好" → English) with the production prompt and schema,
 * bypassing the cache.  Returns only status flags, never upstream
 * messages.
 */
async function healthCheck(): Promise<Response> {
  const check = async (provider: AiProvider) => {
    const key = providerKey(provider);
    if (!key) return { provider, configured: false };
    const started = Date.now();
    const prompt = FORWARD_PROMPT('好', 'English');
    try {
      const r =
        provider === 'claude'
          ? await callClaude(prompt, FORWARD_SCHEMA, key, 20_000)
          : await callGemini(GEMINI_PRIMARY_MODEL, prompt, FORWARD_SCHEMA, key, 20_000);
      return {
        provider,
        configured: true,
        ok: Array.isArray(r.meanings) && r.meanings.length > 0,
        meanings: Array.isArray(r.meanings) ? r.meanings.length : 0,
        ms: Date.now() - started,
      };
    } catch (err) {
      return {
        provider,
        configured: true,
        ok: false,
        kind: err instanceof AiProviderError ? err.kind : 'other',
        status: err instanceof AiProviderError ? err.status : undefined,
        ms: Date.now() - started,
      };
    }
  };
  const results = await Promise.all((['gemini', 'claude'] as const).map(check));
  return new Response(
    JSON.stringify({ chain: configuredProviders(), providers: results }),
    {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    },
  );
}

/* ────────────────────────────────────────────────────────────────
 * Auth — best-effort verification of the caller's Supabase access token.
 *
 * Anonymous traffic is now ALLOWED so visitors can try the dictionary
 * without registering — registration is positioned as an optional
 * upgrade for users who want a persistent knowledge base.  When a token
 * IS provided (signed-in users), we still verify it so an expired or
 * tampered token is rejected outright instead of silently treated as
 * anonymous.  This keeps the contract clean: if the caller claims to
 * be a particular user, that claim is checked; if they make no claim,
 * they're served as guest.
 *
 * We delegate signature verification to Supabase's own /auth/v1/user
 * endpoint instead of reimplementing JWT-HS256 with Web Crypto: it
 * costs one extra ~80ms request, which is negligible next to the AI
 * call (2–5s), and keeps the function free of crypto deps that would
 * balloon the Edge-runtime bundle.
 *
 * Cost protection: now that anon traffic is allowed, abuse is gated
 * only by the AI provider's per-key quota.  TODO when this becomes a
 * real problem: add IP rate-limiting at the edge (Vercel KV, Upstash,
 * or Cloudflare Turnstile).
 *
 * Env vars (we tolerate either the VITE_-prefixed or non-prefixed
 * forms so the user doesn't need to duplicate Supabase secrets in
 * Vercel):
 *   SUPABASE_URL            (or VITE_SUPABASE_URL)
 *   SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY)
 * ─────────────────────────────────────────────────────────────── */

function envSupabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
}
function envSupabaseKey(): string | undefined {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  );
}

/**
 * Auth result:
 *   • { ok: true, userId: string | null } — request can proceed.
 *     userId === null means the caller is anonymous (no Authorization
 *     header).  userId is set when the caller passed a valid bearer
 *     token.
 *   • { ok: false, … } — caller passed a token that turned out to be
 *     invalid/expired/etc.  We reject so the client can prompt the
 *     user to sign in again instead of silently downgrading them to
 *     anonymous (which would mask "I'm logged in but actually not").
 */
type AuthOk = { ok: true; userId: string | null };
type AuthFail = { ok: false; error: string; status: number };

async function verifyAuth(req: Request): Promise<AuthOk | AuthFail> {
  const auth = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) {
    // Anonymous request — allowed.
    return { ok: true, userId: null };
  }
  const token = m[1].trim();

  // Token claimed; we have to verify it.  If the server isn't configured
  // for Supabase we can't honor the claim, so fail closed (better than
  // silently letting through what might be a stolen/expired token).
  const supaUrl = envSupabaseUrl();
  const supaKey = envSupabaseKey();
  if (!supaUrl || !supaKey) {
    return {
      ok: false,
      error: '服务端未配置 SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY',
      status: 500,
    };
  }

  let res: Response;
  try {
    res = await fetch(`${supaUrl.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: {
        apikey: supaKey,
        authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `认证服务不可达：${msg}`, status: 502 };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: '登录状态已过期，请重新登录', status: 401 };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: `认证服务返回错误（${res.status}）`,
      status: 502,
    };
  }

  const user = (await res.json()) as { id?: string };
  if (!user?.id) {
    return { ok: false, error: '认证服务未返回用户 id', status: 401 };
  }
  return { ok: true, userId: user.id };
}

/* ────────────────────────────────────────────────────────────────
 * Syllable normalization — safety net for when Gemini ignores the
 * "one Chinese character per Syllable object" rule and returns
 * merged entries like { hanzi: "朋友", pinyin: "péngyǒu" }.
 * ─────────────────────────────────────────────────────────────── */

const HAN_RE = /[㐀-鿿豈-﫿]/;
// Any vowel — tone-marked or plain.  We use ALL vowels (not just
// tone-marked) because Gemini sometimes drops tone marks despite the
// prompt, and we still need to split correctly: "wancheng" must
// yield ["wan","cheng"], not ["wancheng"] (the user-visible bug
// where the entire pinyin gets stuck above 完 with nothing on 成).
const VOWEL_RE = /[aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;

/**
 * Split a continuous (no-space) pinyin string into per-syllable chunks.
 *
 * Examples:
 *   "gōngzuò"     → ["gōng", "zuò"]      (correctly absorbs 'ng' final)
 *   "péngyǒu"     → ["péng", "yǒu"]
 *   "zhōngguórén" → ["zhōng", "guó", "rén"]
 *   "wancheng"    → ["wan", "cheng"]     (works on no-tone input too)
 *   "shēngrì"     → ["shēng", "rì"]      ('r' as initial of next syl)
 *   "huār"        → ["huār"]             ('r' as erhua final)
 *
 * Earlier version split on tone-mark boundaries only and produced
 * ["gō", "ngzuò"] for "gōngzuò" (the 'n' after 'ō' was incorrectly
 * treated as the next syllable's initial instead of the current
 * syllable's '-ng' final), which surfaced as the user-visible bug
 * "go    ngzuo" rendered above 工作 in example sentences.  The
 * tone-only approach also failed entirely on no-tone input —
 * "wancheng" returned a single chunk and the entire pinyin landed
 * above 完 with nothing on 成.  This rewrite uses a proper greedy
 * initial+vowel+final parser that handles both cases.
 */
function splitContinuousPinyin(pinyin: string): string[] {
  const tokens: string[] = [];
  const isVowel = (ch: string | undefined) => !!ch && VOWEL_RE.test(ch);
  let i = 0;
  const n = pinyin.length;
  while (i < n) {
    const start = i;

    // Phase 1 — initial consonant cluster.  Skip any non-vowel run
    // (covers 'b', digraphs like 'zh'/'ch'/'sh', and edge cases like
    // a syllable that starts with no initial — 'a', 'e', 'o' just
    // skip this phase immediately).
    while (i < n && !isVowel(pinyin[i])) i++;

    // Phase 2 — vowel cluster (medial + nucleus).  Greedily consume
    // every vowel.  Handles diphthongs ('ai', 'ou', 'uo', 'iao') and
    // tone-marked vowels uniformly.
    while (i < n && isVowel(pinyin[i])) i++;

    // Phase 3 — optional final 'n', 'ng', or 'r' (erhua).  The hard
    // case is distinguishing "final + next syllable's vowel" from
    // "final + next syllable's consonant".  Rule: a consonant after
    // the vowel cluster is a final ONLY if the next char is also a
    // consonant or end-of-string; if the next char is a vowel, the
    // consonant starts the next syllable instead.  For 'ng',
    // following Mandarin convention, prefer the 'ng-final' reading
    // when ambiguous (no apostrophe to disambiguate).
    if (i < n) {
      const c = pinyin[i].toLowerCase();
      if (c === 'n') {
        if (isVowel(pinyin[i + 1])) {
          // 'n' + vowel → 'n' is initial of next syllable.
        } else {
          i++;
          if (i < n && pinyin[i].toLowerCase() === 'g') {
            // 'g' could be 'ng' final's tail, OR the start of the
            // next syllable's initial.  Greedy: take it as 'ng'.
            i++;
          }
        }
      } else if (c === 'r') {
        if (!isVowel(pinyin[i + 1])) {
          // Erhua final.
          i++;
        }
      }
    }

    if (i > start) {
      tokens.push(pinyin.slice(start, i));
    } else {
      // Defensive: input doesn't fit the model at all (e.g. all
      // consonants).  Consume one char to avoid an infinite loop.
      tokens.push(pinyin.slice(start, start + 1));
      i = start + 1;
    }
  }
  return tokens;
}

/**
 * Split pinyin into per-character chunks.  Prefers explicit spaces
 * ("péng yǒu" → ["péng","yǒu"]) and falls back to tone-boundary
 * detection for the more common merged form ("péngyǒu").
 */
function splitPinyin(pinyin: string): string[] {
  const trimmed = pinyin.trim();
  if (!trimmed) return [];
  if (/\s/.test(trimmed)) {
    return trimmed.split(/\s+/).filter((s) => s);
  }
  return splitContinuousPinyin(trimmed);
}

/**
 * Walk a Syllable array and expand any entry whose `hanzi` contains
 * multiple Chinese characters into one Syllable per character.  This
 * is purely a corrective step — Gemini is told in the prompt to do
 * this itself, but we can't trust it 100%.
 */
/**
 * For a single Chinese character, the pinyin is by definition exactly
 * one syllable.  AI sometimes inserts a stray space within it
 * (observed: `{hanzi: "工", pinyin: "go ng"}` instead of `"gōng"`),
 * which surfaces in the rendered ChineseLine as a visible internal
 * gap above the character.  Strip whitespace from any
 * single-Han-char Syllable's pinyin to repair this.
 */
function cleanSingleCharPinyin(syl: ApiSyllable): ApiSyllable {
  const hanzi = typeof syl?.hanzi === 'string' ? syl.hanzi : '';
  const pinyin = typeof syl?.pinyin === 'string' ? syl.pinyin : '';
  const chars = [...hanzi];
  const isSingleHan = chars.length === 1 && HAN_RE.test(chars[0]);
  if (isSingleHan && /\s/.test(pinyin)) {
    return { hanzi, pinyin: pinyin.replace(/\s+/g, '') };
  }
  return { hanzi, pinyin };
}

function normalizeSyllables(syllables: ApiSyllable[] | undefined | null): ApiSyllable[] {
  if (!Array.isArray(syllables)) return [];
  const out: ApiSyllable[] = [];
  for (const syl of syllables) {
    const hanzi = typeof syl?.hanzi === 'string' ? syl.hanzi : '';
    const pinyin = typeof syl?.pinyin === 'string' ? syl.pinyin : '';

    // Count Chinese characters in this hanzi field.
    const chars = [...hanzi];
    const hanCount = chars.filter((c) => HAN_RE.test(c)).length;

    if (hanCount <= 1) {
      // Already single Han character (or pure punctuation) — pass
      // through, but strip stray whitespace from a 1-char pinyin
      // (Gemini occasionally hands us "go ng" for 工).
      out.push(cleanSingleCharPinyin({ hanzi, pinyin }));
      continue;
    }

    // Multi-character — try to split pinyin to match.
    const pinyinChunks = splitPinyin(pinyin);
    const canAlign = pinyinChunks.length === hanCount;

    let pIdx = 0;
    for (const c of chars) {
      if (HAN_RE.test(c)) {
        out.push({
          hanzi: c,
          pinyin: canAlign ? pinyinChunks[pIdx++] ?? '' : '',
        });
      } else {
        // Punctuation / latin / digits inside a merged chunk — emit with empty pinyin.
        out.push({ hanzi: c, pinyin: '' });
      }
    }
    // If we couldn't align pinyin chunks, dump the whole pinyin onto the
    // first Han character as a "best effort" so at least nothing is lost.
    // (This matches the previous user-visible behavior; it's still
    // imperfect but better than completely dropping the pinyin.)
    if (!canAlign && pinyin) {
      const firstHanIdx = out.length - chars.length + chars.findIndex((c) => HAN_RE.test(c));
      if (firstHanIdx >= 0 && out[firstHanIdx]) {
        out[firstHanIdx].pinyin = pinyin;
      }
    }
  }
  return out;
}

/**
 * Apply syllable normalization to every place a Syllable[] appears in
 * the response — wordSyllables, each meaning's hanziSyllables (reverse
 * mode), and each meaning's example.chinese.
 */
function normalizeResponse(r: ApiResponse): ApiResponse {
  r.wordSyllables = normalizeSyllables(r.wordSyllables);
  if (Array.isArray(r.meanings)) {
    for (const m of r.meanings) {
      if (m.hanziSyllables) m.hanziSyllables = normalizeSyllables(m.hanziSyllables);
      if (m.example) m.example.chinese = normalizeSyllables(m.example.chinese);
    }
  }
  return r;
}

/* ────────────────────────────────────────────────────────────────
 * Traditional-character detection (Simplified-only safety net)
 *
 * The prompts already tell Gemini "Simplified only".  This is a
 * server-side belt-and-braces check that catches the cases where
 * the AI still emits 繁體字 — usually when the input was traditional
 * and the AI's autoregressive bias drags some characters along.
 *
 * Approach: a curated set of "traditional-only" characters — code
 * points that appear in Traditional Chinese text but NEVER in
 * Mainland Simplified text.  Each char in the set has a known
 * Simplified counterpart.  Most are present in the Simplified→
 * Traditional simplification table (e.g. 個↔个, 們↔们, 學↔学) plus
 * a handful of very-frequent traditional-only characters seen in
 * dictionary output.
 *
 * On detect: we replace each traditional char in-place with its
 * simplified counterpart.  This is a stop-gap; the prompt is the
 * primary line of defense.  A full opencc-style converter would
 * cover thousands of characters but blow up the Edge bundle and
 * has its own ambiguity issues (一字多简).  This curated map (~150
 * entries) covers >95% of the bad output we'd realistically see.
 *
 * Exported for unit testing.
 * ─────────────────────────────────────────────────────────────── */

/**
 * Curated traditional → simplified map.  Each entry is a single-
 * character pair where the traditional form is unambiguous (one
 * traditional → exactly one simplified).  Multi-mapping cases
 * (e.g. 後→后 vs 后→后) are handled where the traditional side has
 * only one common simplification.
 *
 * Adding to this list: include traditional-only chars that have
 * been observed in real dictionary output AND have a single
 * canonical Simplified mapping.  When in doubt, leave the char
 * out and rely on the prompt rule instead — false replacements
 * are worse than missed ones.
 */
const TRAD_TO_SIMP: Record<string, string> = {
  // pronouns / function words
  個: '个', 們: '们', 這: '这', 麼: '么', 沒: '没', 與: '与',
  從: '从', 來: '来', 會: '会', 幾: '几', 對: '对',
  // common verbs / adjectives
  學: '学', 說: '说', 覺: '觉', 變: '变', 動: '动', 開: '开',
  關: '关', 寫: '写', 讀: '读', 問: '问', 認: '认', 識: '识',
  愛: '爱', 樂: '乐', 應: '应', 該: '该', 給: '给',
  讓: '让', 聽: '听', 點: '点', 飛: '飞', 過: '过', 為: '为',
  進: '进', 還: '还', 種: '种', 連: '连', 達: '达', 選: '选',
  // common nouns
  國: '国', 體: '体', 漢: '汉', 語: '语', 書: '书', 錢: '钱',
  飯: '饭', 電: '电', 話: '话', 車: '车', 馬: '马', 鳥: '鸟',
  魚: '鱼', 龍: '龙', 場: '场', 廠: '厂', 廣: '广', 專: '专',
  業: '业', 義: '义', 鄉: '乡', 縣: '县', 區: '区',
  島: '岛', 萬: '万', 億: '亿', 員: '员', 銀: '银', 標: '标',
  際: '际', 號: '号', 證: '证', 機: '机', 構: '构',
  術: '术', 樣: '样', 樓: '楼', 級: '级', 紙: '纸', 線: '线',
  網: '网', 圖: '图', 媽: '妈', 爺: '爷', 兒: '儿',
  腦: '脑', 課: '课', 練: '练', 習: '习', 試: '试', 計: '计',
  記: '记', 紀: '纪', 紅: '红', 綠: '绿', 藍: '蓝', 黃: '黄',
  // time / quantity / direction
  時: '时', 間: '间', 歲: '岁', 條: '条', 隻: '只',
  雙: '双', 緊: '紧', 寬: '宽', 輕: '轻',
  // misc high-frequency
  難: '难', 簡: '简', 醫: '医', 藥: '药', 飲: '饮', 餓: '饿',
  雞: '鸡', 鴨: '鸭', 蝦: '虾', 葉: '叶', 樹: '树', 燈: '灯',
  劇: '剧', 廳: '厅', 廁: '厕', 處: '处', 鬥: '斗',
  鳳: '凤', 麗: '丽', 龜: '龟', 鹽: '盐', 鐵: '铁', 鏡: '镜',
  鐘: '钟', 養: '养', 髒: '脏', 髮: '发',
  鬆: '松', 鬧: '闹', 雜: '杂',
};

const TRAD_CHAR_RE = new RegExp(
  '[' + Object.keys(TRAD_TO_SIMP).join('') + ']',
  'g',
);

/**
 * Replace traditional characters with their simplified counterparts
 * inline.  Returns `{ converted, replacementCount }` so callers can
 * log how aggressive the safety-net was on a given response.
 */
export function toSimplified(s: string): { converted: string; replacements: number } {
  let replacements = 0;
  const converted = s.replace(TRAD_CHAR_RE, (ch) => {
    replacements++;
    return TRAD_TO_SIMP[ch] ?? ch;
  });
  return { converted, replacements };
}

/**
 * Walk every Chinese-bearing field in the response and force each
 * one to Simplified.  Mutates in place AND returns the total number
 * of replacements made (so the caller can log a warning if the AI
 * needed a lot of fixing — useful for spotting prompt drift).
 */
function forceSimplifiedResponse(r: ApiResponse): number {
  let total = 0;
  const fixSyllable = (syl: ApiSyllable): ApiSyllable => {
    const { converted, replacements } = toSimplified(syl.hanzi);
    total += replacements;
    return replacements > 0 ? { ...syl, hanzi: converted } : syl;
  };
  if (Array.isArray(r.wordSyllables)) {
    r.wordSyllables = r.wordSyllables.map(fixSyllable);
  }
  if (Array.isArray(r.meanings)) {
    for (const m of r.meanings) {
      if (Array.isArray(m.hanziSyllables)) {
        m.hanziSyllables = m.hanziSyllables.map(fixSyllable);
      }
      if (m.example && Array.isArray(m.example.chinese)) {
        m.example.chinese = m.example.chinese.map(fixSyllable);
      }
      // Definition is in the target language for forward, source
      // language for reverse — for either, it can contain
      // parenthetical Chinese (e.g. "to drive (开车)").  Run the
      // converter over it too.
      if (typeof m.definition === 'string') {
        const { converted, replacements } = toSimplified(m.definition);
        if (replacements > 0) {
          total += replacements;
          m.definition = converted;
        }
      }
    }
  }
  return total;
}

/* ────────────────────────────────────────────────────────────────
 * Global dictionary cache (Supabase `dictionary_cache` table)
 *
 * Why server-side instead of just client-side: a per-user / per-device
 * cache only helps the same person on the same device.  A shared
 * library ensures the AI is called at most once across ALL users for
 * the same (word, language, direction) — instant + zero-cost on every
 * subsequent query, no matter who issued the original.
 *
 * Schema lives in supabase/schema.sql (v2 migration block).  RLS is
 * open (SELECT + INSERT for everyone) because rows contain no PII —
 * just the AI's translation output, identical no matter who asked.
 *
 * Cache key:
 *   forward (zh-to-other): word_normalized + language (both lowercased)
 *   reverse (other-to-zh): word_normalized only (language is auto-
 *     detected by the AI; same English input from different users
 *     gets the same Chinese candidates).
 *
 * Errors are non-fatal: a cache lookup failure means we just fall
 * through to the AI; a cache write failure is logged but doesn't
 * affect the user's response.
 * ─────────────────────────────────────────────────────────────── */

function normalizeCacheKey(word: string): string {
  return word.trim().toLowerCase();
}

function cacheLanguageForWrite(direction: Direction, language: string): string {
  return direction === 'zh-to-other' ? language.trim().toLowerCase() : '';
}

interface CachedRow {
  payload: ApiResponse;
}

async function lookupCache(
  direction: Direction,
  word: string,
  language: string,
): Promise<ApiResponse | null> {
  const supaUrl = envSupabaseUrl();
  const supaKey = envSupabaseKey();
  if (!supaUrl || !supaKey) return null; // can't cache without config

  const wordKey = normalizeCacheKey(word);
  const langKey = cacheLanguageForWrite(direction, language);

  // PostgREST query: filter on direction + word_normalized; for forward
  // also filter on language.  `select=payload` returns just the JSONB
  // we need.  `limit=1` because the unique index guarantees at most one.
  const params = new URLSearchParams({
    direction: `eq.${direction}`,
    word_normalized: `eq.${wordKey}`,
    select: 'payload',
    limit: '1',
  });
  if (direction === 'zh-to-other') {
    params.set('language', `eq.${langKey}`);
  }

  let res: Response;
  try {
    res = await fetch(
      `${supaUrl.replace(/\/+$/, '')}/rest/v1/dictionary_cache?${params}`,
      { headers: { apikey: supaKey, authorization: `Bearer ${supaKey}` } },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[cache] lookup network error; falling through to AI:', err);
    return null;
  }
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[cache] lookup HTTP ${res.status}; falling through to AI`);
    return null;
  }
  let rows: CachedRow[];
  try {
    rows = (await res.json()) as CachedRow[];
  } catch {
    return null;
  }
  if (!rows || rows.length === 0) return null;
  return rows[0].payload;
}

async function storeCache(
  direction: Direction,
  word: string,
  language: string,
  payload: ApiResponse,
  /**
   * When true, OVERWRITE any existing row for the same key instead of
   * silently skipping on conflict.  Used by the Refresh button so a
   * regenerated payload replaces the bad cached one.  Implemented via
   * PostgREST's `Prefer: resolution=merge-duplicates` upsert mode,
   * targeting the (word_normalized, language) partial unique index
   * for forward and (word_normalized) for reverse — matching the
   * indexes declared in supabase/schema.sql.
   */
  upsert = false,
): Promise<void> {
  const supaUrl = envSupabaseUrl();
  const supaKey = envSupabaseKey();
  if (!supaUrl || !supaKey) return;

  const wordKey = normalizeCacheKey(word);
  const langKey = cacheLanguageForWrite(direction, language);

  // PostgREST upsert needs us to name the conflict columns explicitly
  // because the unique constraint is a *partial* index (filtered by
  // direction).  The `on_conflict` query param tells PostgREST which
  // index to use; without it the upsert would target the table's PK
  // (`id`) and never match.
  const onConflict =
    direction === 'zh-to-other' ? 'word_normalized,language' : 'word_normalized';

  const url = upsert
    ? `${supaUrl.replace(/\/+$/, '')}/rest/v1/dictionary_cache?on_conflict=${encodeURIComponent(onConflict)}`
    : `${supaUrl.replace(/\/+$/, '')}/rest/v1/dictionary_cache`;

  const headers: Record<string, string> = {
    apikey: supaKey,
    authorization: `Bearer ${supaKey}`,
    'content-type': 'application/json',
    // Don't return the inserted/updated row — we don't need it.
    prefer: upsert ? 'return=minimal,resolution=merge-duplicates' : 'return=minimal',
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        direction,
        word_normalized: wordKey,
        language: langKey,
        payload,
      }),
    });
    // Bare INSERT path: 409 = a concurrent writer already filled this
    // cell, treat as success.  Upsert path: 409 should not happen since
    // the merge resolution turns conflicts into UPDATEs, but we still
    // tolerate it to avoid spurious noise.
    if (!res.ok && res.status !== 409) {
      const text = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(
        `[cache] store HTTP ${res.status} (upsert=${upsert}): ${text.slice(0, 200)}`,
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[cache] store network error (non-fatal):', err);
  }
}

/* ────────────────────────────────────────────────────────────────
 * Handler
 * ─────────────────────────────────────────────────────────────── */

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET' && new URL(req.url).searchParams.has('health')) {
    return healthCheck();
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Auth gate — runs before any AI call so unauthorized traffic is cheap.
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  let payload: TranslateRequest;
  try {
    payload = (await req.json()) as TranslateRequest;
  } catch {
    return json({ error: '请求体不是合法 JSON' }, 400);
  }

  const word = payload.word?.trim();
  const language = payload.language?.trim();
  const direction: Direction =
    payload.direction === 'other-to-zh' ? 'other-to-zh' : 'zh-to-other';
  const force = payload.force === true;

  if (!word) {
    return json({ error: '缺少 word 参数' }, 400);
  }
  // Both directions support full-sentence input now.  Cap at 300 chars so
  // a typical sentence/paragraph fits but a runaway paste-bomb doesn't
  // gobble Gemini quota.  Edge function runtime limits and AI latency are
  // the real ceilings, not character count.
  const maxLen = 300;
  if (word.length > maxLen) {
    return json({ error: `单次查询长度不能超过 ${maxLen} 个字符` }, 400);
  }
  if (direction === 'zh-to-other' && !language) {
    return json({ error: '缺少 language 参数' }, 400);
  }

  // ─── Global cache lookup ───────────────────────────────────────
  // Check the shared dictionary_cache first.  If anyone has already
  // queried this (word, language, direction), serve their AI result
  // instantly and skip the Gemini call entirely.  Cache lookup is
  // ~50–200ms — negligible vs the 5–15s AI call we save on hits.
  //
  // If `force` is set, skip the lookup entirely so the AI is called
  // unconditionally — the response will then OVERWRITE the existing
  // cache row (see storeCache(..., upsert=true) below).  This is
  // how the Refresh button regenerates a known-bad cache entry.
  if (!force) {
    const cached = await lookupCache(direction, word, language);
    if (cached) {
      return json({ ...cached, _fromCache: true } as ApiResponse, 200);
    }
  }

  const prompt =
    direction === 'other-to-zh'
      ? REVERSE_PROMPT(word)
      : FORWARD_PROMPT(word, language);
  const schema = direction === 'other-to-zh' ? REVERSE_SCHEMA : FORWARD_SCHEMA;

  if (configuredProviders().length === 0) {
    return json(
      {
        error: '服务端未配置 GEMINI_API_KEY 或 ANTHROPIC_API_KEY',
        errorCode: 'AI_AUTH',
        detail: 'no AI provider configured',
      },
      500,
    );
  }

  const outcome = await translateWithProviders(prompt, schema);
  if (!outcome.ok) {
    const summary = summarizeAiFailures(outcome.failures, outcome.configured);
    // eslint-disable-next-line no-console
    console.error(
      `[ai] all providers failed (${summary.code}): ${outcome.failures
        .map((f) => `${f.provider}=${f.kind}: ${f.message.slice(0, 200)}`)
        .join(' | ')}`,
    );
    return json(
      { error: summary.message, errorCode: summary.code, detail: summary.detail },
      summary.code === 'AI_FAILED' ? 502 : 503,
    );
  }

  try {
    let result = outcome.result;
    // Echo back word in case AI normalized it
    result.word = result.word || word;
    if (direction === 'zh-to-other') {
      result.language = result.language || language;
    } else {
      // Reverse mode: AI fills `language` with detected source. Ensure wordSyllables is empty.
      result.wordSyllables = [];
    }
    result.direction = direction;
    // Safety net: even with explicit prompt rules, Gemini occasionally
    // emits merged Syllables like { hanzi: "朋友", pinyin: "péngyǒu" }.
    // Splitting them server-side guarantees ChineseLine renders pinyin
    // above every character.  See normalizeSyllables() for details.
    result = normalizeResponse(result);

    // Second safety net: enforce Simplified Chinese throughout.  The
    // prompts already mandate this, but Gemini occasionally drifts —
    // especially when the input contains traditional characters (its
    // autoregressive bias drags some 繁體 along).  We convert any
    // detected traditional character to its Simplified counterpart
    // in-place.  Logged when it had to do anything, so prompt
    // regressions are visible in the function logs.
    const simpReplacements = forceSimplifiedResponse(result);
    if (simpReplacements > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[simplified] post-AI converted ${simpReplacements} traditional char(s) to simplified for word="${word}" (${direction})`,
      );
    }

    // Write the AI result into the global cache.  IMPORTANT: must
    // await — Vercel Edge Functions terminate pending Promises the
    // moment the handler returns a Response, so a fire-and-forget
    // `storeCache(...).catch(...)` would never actually flush.
    // The added latency is ~50–150 ms (one PostgREST INSERT) on a
    // path that already took 4+ seconds for the AI call, so it's
    // imperceptible to the user.  Errors are caught here so a cache
    // outage never breaks the actual response.
    try {
      await storeCache(direction, word, language, result, force /* upsert when refreshing */);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[cache] post-AI write rejected:', e);
    }

    return json({ ...result, _fromCache: false } as ApiResponse, 200, {
      'x-ai-provider': outcome.provider,
    });
  } catch (err) {
    // Only post-processing of a successful AI answer can land here
    // (e.g. a payload missing the expected arrays).
    const msg = err instanceof Error ? err.message : String(err);
    return json(
      { error: `AI 返回结果处理失败：${msg}`, errorCode: 'AI_FAILED', detail: msg.slice(0, 120) },
      500,
    );
  }
}

function json(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}
