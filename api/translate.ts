/**
 * POST /api/translate
 * Body: {
 *   word: string,
 *   language: string,                                    // ignored when direction = "other-to-zh"
 *   direction?: "zh-to-other" | "other-to-zh"            // default "zh-to-other"
 * }
 * Response: TranslateResponse (JSON) — see src/types/dictionary.ts
 *
 * Runs on Vercel Edge Runtime — zero npm deps, uses fetch directly.
 * Reads AI_PROVIDER env ("gemini" | "claude"). Defaults to "gemini".
 */

export const config = { runtime: 'edge' };

type Direction = 'zh-to-other' | 'other-to-zh';

interface TranslateRequest {
  word: string;
  language: string;
  direction?: Direction;
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

第一步 · 判断输入类型：
- 如果是 SINGLE WORD / PHRASE（单字、词、固定短语，如"好"、"打"、"一带一路"），按"词条模式"输出。
- 如果是 FULL SENTENCE / CLAUSE（完整句子或带标点的整段文字，如"今天天气真好。"或多个句子拼接），按"整句翻译模式"输出。

【词条模式】严格要求：
1. 列出所有常用含义与词性，每个单独作为一个 meaning 对象。
2. 如果是多音字或多音词，在每个 meaning 中填写 pinyin 字段表示该义项的读音。
3. 每个 meaning 提供一个自然、地道的中文例句。
4. 例句拆分为 Syllable 数组（见下方"Syllable 拆分规则"）。
5. wordSyllables 同样按 Syllable 拆分规则给出该词的主拼音读法（多音字取最常用）。
6. partOfSpeech、definition、example.translation 全部使用 ${language} 书写。
7. pinyin 使用带声调的带调标字母（例如 "hǎo"、"zhōng"、"cháng"），不要使用数字声调。

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
         translation: that sentence's equivalent in the SOURCE LANGUAGE.
       For FULL SENTENCE inputs: set example to { "chinese": [], "translation": "" } — empty arrays/strings, no example needed because the candidate IS the translation already.
4. Top-level fields:
   - word: echo the learner's original input verbatim.
   - wordSyllables: ALWAYS return an empty array [] (the learner did not input Chinese — there's nothing to syllabify on the input side).
   - language: detected source language as described above.

Pinyin uses tone-marked letters ("hǎo", "zhōng", "shén"), never numeric tones.

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
 * Retry wrapper for Gemini calls.  The free tier surfaces 503
 * UNAVAILABLE / 429 RESOURCE_EXHAUSTED during peak hours — these are
 * almost always transient (just a few seconds of capacity pressure on
 * Google's side), so retrying once or twice usually succeeds without
 * the user ever seeing an error.
 *
 * Permanent errors (400 bad input, 401/403 auth) are NOT retried —
 * we throw immediately so the user gets the real cause fast.
 */
const GEMINI_RETRY_DELAYS_MS = [1500, 3500]; // attempts after the first

async function callGeminiWithRetry(
  prompt: string,
  schema: object,
  apiKey: string,
): Promise<ApiResponse> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= GEMINI_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = GEMINI_RETRY_DELAYS_MS[attempt - 1] ?? 0;
      await new Promise((r) => setTimeout(r, delay));
    }
    try {
      return await callGemini(prompt, schema, apiKey);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient =
        /\b(503|429|500|502|504)\b/.test(msg) ||
        /UNAVAILABLE|OVERLOADED|RESOURCE_EXHAUSTED|deadline/i.test(msg);
      if (!transient) {
        // Permanent error — don't waste retry budget on it.
        throw err;
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[gemini] attempt ${attempt + 1}/${GEMINI_RETRY_DELAYS_MS.length + 1} failed (transient); will retry. ${msg.slice(0, 200)}`,
      );
    }
  }
  // Out of retries — throw the last seen error so the handler can map it
  // to a friendly user-facing message.
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function callGemini(
  prompt: string,
  schema: object,
  apiKey: string,
): Promise<ApiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
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

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 返回了空内容');
  return JSON.parse(text) as ApiResponse;
}

async function callClaude(
  prompt: string,
  apiKey: string,
): Promise<ApiResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content:
            prompt +
            '\n\nOutput must be a single JSON object — no prose, no code fences.',
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json() as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data?.content?.find((b) => b.type === 'text')?.text ?? '';
  // Strip code fences if Claude wrapped it
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned) as ApiResponse;
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
// Tone-marked vowels (the nucleus of a Mandarin pinyin syllable always
// carries exactly one tone mark — that's how we find syllable boundaries).
const TONE_VOWEL = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;
// Consonants that can start a Mandarin pinyin syllable.  `ng` boundaries
// are handled implicitly because if cur ends with `n` or `ng`, those are
// final consonants; the next consonant after a tone vowel is always a
// new syllable's initial.
const PINYIN_INITIAL = /[bpmfdtnlgkhjqxzcsrwy]/i;

/**
 * Split a continuous (no-space) pinyin string like "péngyǒu" or
 * "zhōngguórén" into per-syllable chunks ["péng","yǒu"] /
 * ["zhōng","guó","rén"] using tone-mark boundaries.
 *
 * Heuristic: each pinyin syllable contains exactly one tone-marked
 * vowel.  After a tone vowel, the first consonant we see is the
 * initial of the next syllable — split there.
 *
 * Edge cases: "ng" ending followed by vowel (e.g. "fan'an") is
 * ambiguous in Chinese pinyin but very rare in textbook examples.
 * If the heuristic produces a syllable count that doesn't match the
 * caller's expectation, the caller falls back to "first char gets
 * the whole pinyin" rather than corrupt the data.
 */
function splitContinuousPinyin(pinyin: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let sawTone = false;
  for (const ch of pinyin) {
    if (TONE_VOWEL.test(ch)) {
      cur += ch;
      sawTone = true;
    } else if (sawTone && PINYIN_INITIAL.test(ch)) {
      tokens.push(cur);
      cur = ch;
      sawTone = false;
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
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
      // Already single Han character (or pure punctuation) — pass through.
      out.push({ hanzi, pinyin });
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
 * Handler
 * ─────────────────────────────────────────────────────────────── */

export default async function handler(req: Request): Promise<Response> {
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

  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const prompt =
    direction === 'other-to-zh'
      ? REVERSE_PROMPT(word)
      : FORWARD_PROMPT(word, language);
  const schema = direction === 'other-to-zh' ? REVERSE_SCHEMA : FORWARD_SCHEMA;

  try {
    let result: ApiResponse;
    if (provider === 'claude') {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return json({ error: '服务端未配置 ANTHROPIC_API_KEY' }, 500);
      result = await callClaude(prompt, key);
    } else {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return json({ error: '服务端未配置 GEMINI_API_KEY' }, 500);
      result = await callGeminiWithRetry(prompt, schema, key);
    }
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
    return json(result, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface the most common transient Gemini failure (peak-hour
    // capacity pressure) with a Chinese-friendly message — the raw
    // upstream payload is English-only and unhelpful for end users.
    // This branch only fires when the retry wrapper has already
    // exhausted its attempts, so suggesting "稍后再试" is honest.
    const isCapacityIssue =
      /\b(503|429)\b/.test(msg) ||
      /UNAVAILABLE|OVERLOADED|RESOURCE_EXHAUSTED|high demand/i.test(msg);
    if (isCapacityIssue) {
      return json(
        {
          error:
            'AI 服务正繁忙（Gemini 高峰期），已自动重试仍未成功，请过 30 秒后再查询。如果长时间持续不可用，可在 Vercel 把 AI_PROVIDER 切换为 claude。',
        },
        503,
      );
    }
    return json({ error: `AI 调用失败：${msg}` }, 500);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
