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

对中文词"${word}"提供详细解释，翻译目标语言为 ${language}。

严格要求：
1. 列出所有常用含义与词性，每个单独作为一个 meaning 对象。
2. 如果是多音字或多音词，在每个 meaning 中填写 pinyin 字段表示该义项的读音。
3. 每个 meaning 提供一个自然、地道的中文例句。
4. 例句拆分为 Syllable 数组：每个汉字一个对象 { hanzi, pinyin }；标点符号也占一个位置，但 pinyin 填空字符串 ""。
5. wordSyllables 同样是 Syllable 数组，表示该词的主拼音读法（多音字取最常用）。
6. partOfSpeech、definition、example.translation 全部使用 ${language} 书写。
7. pinyin 使用带声调的带调标字母（例如 "hǎo"、"zhōng"、"cháng"），不要使用数字声调。
8. 只返回 JSON，严格符合提供的 schema，不要添加任何其他文字。`;

const REVERSE_PROMPT = (word: string) => `You are an expert Chinese language teacher who helps non-native learners find idiomatic Chinese expressions. The learner can input a word, phrase, or full sentence in ANY language (or even a mix of multiple languages, e.g. English + Japanese, or English with some Chinese inserted).

The learner's input is:
"""
${word}
"""

Tasks:
1. Auto-detect the source language(s). Set the "language" field to the language name (e.g. "English", "Français", "日本語"). If the input is mixed, write something like "Mixed: English + Japanese". Use the language's own native name when possible.
2. Decide whether the input is a SINGLE WORD/PHRASE or a FULL SENTENCE:
   - WORD/PHRASE → produce 2-5 distinct Chinese candidate translations as separate meaning objects, ordered from most common/neutral to more marked. The whole point is to help the learner pick the right one for the situation.
   - FULL SENTENCE → produce exactly ONE meaning containing the single best idiomatic Chinese rendering.
3. For each meaning fill these fields:
   - partOfSpeech: written in the SOURCE LANGUAGE (e.g. "adjective", "verb", "expression", "形容詞")
   - register: REQUIRED, one of "casual" (slangy/informal), "colloquial" (everyday spoken), "neutral" (works anywhere), "formal" (official/business), "literary" (written/poetic/classical-flavored)
   - hanziSyllables: the Chinese candidate broken per-character. Each entry { hanzi, pinyin }. Punctuation marks each occupy one entry with pinyin: "".
   - definition: 1-2 sentences IN THE SOURCE LANGUAGE explaining the nuance — when to use this candidate, what register/situation it fits, and how it differs from the other candidates. Be concrete; mention spoken vs written, formality, emotional tone, regional usage when relevant.
   - example: { chinese, translation }
       chinese: a natural, idiomatic Chinese sentence USING THIS CANDIDATE, broken per-character with pinyin.
       translation: that sentence's equivalent in the SOURCE LANGUAGE.
4. Top-level fields:
   - word: echo the learner's original input verbatim.
   - wordSyllables: ALWAYS return an empty array [] (the learner did not input Chinese — there's nothing to syllabify on the input side).
   - language: detected source language as described above.

Pinyin uses tone-marked letters ("hǎo", "zhōng", "shén"), never numeric tones.

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
  // Reverse mode allows longer input (full sentences in any language) — be more lenient.
  const maxLen = direction === 'other-to-zh' ? 200 : 40;
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
      result = await callGemini(prompt, schema, key);
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
    return json(result, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `AI 调用失败：${msg}` }, 500);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
