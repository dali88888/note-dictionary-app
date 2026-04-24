/**
 * POST /api/translate
 * Body: { word: string, language: string }
 * Response: TranslateResponse (JSON) — see src/types/dictionary.ts
 *
 * Runs on Vercel Edge Runtime — zero npm deps, uses fetch directly.
 * Reads AI_PROVIDER env ("gemini" | "claude"). Defaults to "gemini".
 */

export const config = { runtime: 'edge' };

interface TranslateRequest {
  word: string;
  language: string;
}

// Mirror of TranslateResponse — duplicated here so the API package has no
// dependency on src/. The shapes MUST stay in sync with src/types/dictionary.ts.
interface ApiSyllable { hanzi: string; pinyin: string }
interface ApiMeaning {
  partOfSpeech: string;
  pinyin?: string;
  definition: string;
  example: { chinese: ApiSyllable[]; translation: string };
}
interface ApiResponse {
  word: string;
  wordSyllables: ApiSyllable[];
  language: string;
  meanings: ApiMeaning[];
}

const SYSTEM_PROMPT = (word: string, language: string) => `你是一位专业的中文词典编辑，为非母语学习者编写词条。

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

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    word: { type: 'STRING' },
    language: { type: 'STRING' },
    wordSyllables: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          hanzi: { type: 'STRING' },
          pinyin: { type: 'STRING' },
        },
        required: ['hanzi', 'pinyin'],
      },
    },
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
              chinese: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    hanzi: { type: 'STRING' },
                    pinyin: { type: 'STRING' },
                  },
                  required: ['hanzi', 'pinyin'],
                },
              },
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
};

async function callGemini(
  word: string,
  language: string,
  apiKey: string,
): Promise<ApiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT(word, language) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_SCHEMA,
      temperature: 0.3,
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
  word: string,
  language: string,
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
            SYSTEM_PROMPT(word, language) +
            '\n\n输出必须是 JSON 对象，字段：word, language, wordSyllables, meanings（结构见要求）。',
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let payload: TranslateRequest;
  try {
    payload = (await req.json()) as TranslateRequest;
  } catch {
    return json({ error: '请求体不是合法 JSON' }, 400);
  }

  const word = payload.word?.trim();
  const language = payload.language?.trim();
  if (!word || !language) {
    return json({ error: '缺少 word 或 language 参数' }, 400);
  }
  if (word.length > 40) {
    return json({ error: '单次查询长度不能超过 40 个字符' }, 400);
  }

  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

  try {
    let result: ApiResponse;
    if (provider === 'claude') {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return json({ error: '服务端未配置 ANTHROPIC_API_KEY' }, 500);
      result = await callClaude(word, language, key);
    } else {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return json({ error: '服务端未配置 GEMINI_API_KEY' }, 500);
      result = await callGemini(word, language, key);
    }
    // Echo back word/language in case AI normalized them
    result.word = result.word || word;
    result.language = result.language || language;
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
