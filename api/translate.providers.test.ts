/**
 * Regression tests for AI provider error handling + the Claude backup.
 *
 * Maps to the user-reported bug: when the Gemini prepaid balance ran
 * out, every query took ~30 s and then showed "AI 服务正繁忙（Gemini
 * 高峰期）… 请过 30 秒后再查询".  Cause: Gemini reports an empty
 * balance as HTTP 402 with status RESOURCE_EXHAUSTED, which the old
 * code treated as a transient capacity error — retried 3× plus the
 * lite model, then reported "busy".
 *
 * These tests pin the fixed behavior:
 *   - 402 is classified as billing: no retries, accurate message.
 *   - With ANTHROPIC_API_KEY set, Claude answers instead.
 *   - Transient Gemini errors are still retried before falling back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, {
  AI_TIMING,
  AiProviderError,
  __resetAiStateForTests,
  classifyGeminiHttpError,
  summarizeAiFailures,
  toClaudeJsonSchema,
} from './translate';

const GEMINI_402_BODY = JSON.stringify({
  error: {
    code: 402,
    message:
      'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.',
    status: 'RESOURCE_EXHAUSTED',
  },
});
const GEMINI_503_BODY = JSON.stringify({
  error: {
    code: 503,
    message: 'The model is overloaded. Please try again later.',
    status: 'UNAVAILABLE',
  },
});

const SAMPLE_ENTRY = {
  word: '好',
  language: 'English',
  wordSyllables: [{ hanzi: '好', pinyin: 'hǎo' }],
  meanings: [
    {
      partOfSpeech: 'adjective',
      pinyin: 'hǎo',
      definition: 'good',
      example: {
        chinese: [
          { hanzi: '很', pinyin: 'hěn' },
          { hanzi: '好', pinyin: 'hǎo' },
        ],
        translation: 'very good',
      },
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const geminiOk = () =>
  jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE_ENTRY) }] } }] });

const claudeOk = () =>
  jsonResponse({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: JSON.stringify(SAMPLE_ENTRY) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  });

const claudeError = (status: number, type: string, message: string) =>
  jsonResponse({ type: 'error', error: { type, message } }, status);

type Route = (init?: RequestInit) => Response;

/** Install a fetch mock that routes by host and records every call. */
function mockFetch(routes: { gemini?: Route; claude?: Route }) {
  const calls: { host: 'gemini' | 'claude'; url: string; body: unknown }[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const host = url.includes('generativelanguage.googleapis.com')
      ? 'gemini'
      : url.includes('api.anthropic.com')
        ? 'claude'
        : null;
    if (!host) throw new Error(`unexpected fetch: ${url}`);
    const route = routes[host];
    if (!route) throw new Error(`no route for ${host}`);
    let body: unknown = undefined;
    if (typeof init?.body === 'string') body = JSON.parse(init.body);
    calls.push({ host, url, body });
    return route(init);
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

function translateRequest(word = '好') {
  return new Request('https://note.example/api/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ word, language: 'English', direction: 'zh-to-other' }),
  });
}

const savedTiming = JSON.parse(JSON.stringify(AI_TIMING)) as typeof AI_TIMING;

beforeEach(() => {
  __resetAiStateForTests();
  // No Supabase → no cache lookups/writes hit the fetch mock.
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('AI_PROVIDER', 'gemini');
  vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  AI_TIMING.geminiRetryDelaysMs = [5, 5];
  AI_TIMING.claudeRetryDelaysMs = [5];
  AI_TIMING.minAttemptMs = 50;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Object.assign(AI_TIMING, JSON.parse(JSON.stringify(savedTiming)));
});

describe('classifyGeminiHttpError', () => {
  it('treats 402 "prepayment credits are depleted" as billing, not as a capacity blip', () => {
    expect(classifyGeminiHttpError(402, GEMINI_402_BODY)).toBe('billing');
  });

  it('treats 429 RESOURCE_EXHAUSTED (rate limit / quota) as rate_limit', () => {
    const body = JSON.stringify({
      error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details.', status: 'RESOURCE_EXHAUSTED' },
    });
    expect(classifyGeminiHttpError(429, body)).toBe('rate_limit');
  });

  it('treats 503 UNAVAILABLE as transient', () => {
    expect(classifyGeminiHttpError(503, GEMINI_503_BODY)).toBe('transient');
  });

  it('treats an invalid API key as auth', () => {
    const body = JSON.stringify({
      error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' },
    });
    expect(classifyGeminiHttpError(400, body)).toBe('auth');
  });

  it('treats other 4xx as other', () => {
    expect(classifyGeminiHttpError(400, '{"error":{"message":"Invalid JSON payload"}}')).toBe('other');
  });
});

describe('summarizeAiFailures', () => {
  it('headline says busy when a retry could help, but still names the empty balance', () => {
    const s = summarizeAiFailures(
      [
        new AiProviderError('gemini', 'billing', 'x', 402),
        new AiProviderError('claude', 'transient', 'y', 529),
      ],
      ['gemini', 'claude'],
    );
    expect(s.code).toBe('AI_BUSY');
    expect(s.message).toContain('预付费额度已用完');
    expect(s.detail).toBe('Gemini: out of credits (HTTP 402) · Claude: busy or timed out (HTTP 529)');
  });

  it('reports billing when every provider is out of credits', () => {
    const s = summarizeAiFailures(
      [
        new AiProviderError('gemini', 'billing', 'x', 402),
        new AiProviderError('claude', 'billing', 'y', 402),
      ],
      ['gemini', 'claude'],
    );
    expect(s.code).toBe('AI_BILLING');
  });
});

describe('toClaudeJsonSchema', () => {
  it('lower-cases types and closes every object', () => {
    const out = toClaudeJsonSchema({
      type: 'OBJECT',
      properties: {
        tags: { type: 'ARRAY', items: { type: 'OBJECT', properties: { a: { type: 'STRING' } }, required: ['a'] } },
        register: { type: 'STRING', enum: ['casual', 'formal'] },
      },
      required: ['tags'],
    });
    expect(out).toEqual({
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: {
            type: 'object',
            properties: { a: { type: 'string' } },
            required: ['a'],
            additionalProperties: false,
          },
        },
        register: { type: 'string', enum: ['casual', 'formal'] },
      },
      required: ['tags'],
      additionalProperties: false,
    });
  });
});

describe('POST /api/translate — provider chain', () => {
  it('Gemini 402 with no backup: one call, AI_BILLING, no misleading "busy" text', async () => {
    const calls = mockFetch({ gemini: () => jsonResponse(GEMINI_402_BODY, 402) });

    const res = await handler(translateRequest());
    const body = (await res.json()) as { error: string; errorCode: string; detail: string };

    expect(res.status).toBe(503);
    expect(body.errorCode).toBe('AI_BILLING');
    expect(body.error).toContain('额度已用完');
    expect(body.error).not.toContain('繁忙');
    expect(body.error).not.toContain('30 秒');
    expect(body.detail).toContain('Gemini: out of credits (HTTP 402)');
    expect(body.detail).toContain('no backup AI configured');
    expect(calls.filter((c) => c.host === 'gemini')).toHaveLength(1);
  });

  it('Gemini 402 with ANTHROPIC_API_KEY set: Claude answers', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-claude-key');
    const calls = mockFetch({
      gemini: () => jsonResponse(GEMINI_402_BODY, 402),
      claude: claudeOk,
    });

    const res = await handler(translateRequest());
    const body = (await res.json()) as typeof SAMPLE_ENTRY;

    expect(res.status).toBe(200);
    expect(res.headers.get('x-ai-provider')).toBe('claude');
    expect(body.meanings[0].definition).toBe('good');
    expect(calls.map((c) => c.host)).toEqual(['gemini', 'claude']);

    const claudeBody = calls[1].body as Record<string, unknown>;
    expect(claudeBody.model).toBe('claude-haiku-5-5');
    expect(claudeBody).not.toHaveProperty('temperature');
    expect(claudeBody.output_config).toMatchObject({ format: { type: 'json_schema' } });
  });

  it('after a billing failure, the next request goes to the backup first', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-claude-key');
    const calls = mockFetch({
      gemini: () => jsonResponse(GEMINI_402_BODY, 402),
      claude: claudeOk,
    });

    await handler(translateRequest('好'));
    const res2 = await handler(translateRequest('大'));

    expect(res2.status).toBe(200);
    expect(calls.map((c) => c.host)).toEqual(['gemini', 'claude', 'claude']);
  });

  it('Gemini 503 is retried (primary + lite) before falling back to Claude', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-claude-key');
    const calls = mockFetch({
      gemini: () => jsonResponse(GEMINI_503_BODY, 503),
      claude: claudeOk,
    });

    const res = await handler(translateRequest());

    expect(res.status).toBe(200);
    const geminiUrls = calls.filter((c) => c.host === 'gemini').map((c) => c.url);
    expect(geminiUrls).toHaveLength(4);
    expect(geminiUrls[3]).toContain('gemini-2.5-flash-lite');
    expect(calls[calls.length - 1].host).toBe('claude');
  });

  it('Gemini 503 recovers on retry without touching Claude', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-claude-key');
    let n = 0;
    const calls = mockFetch({
      gemini: () => (++n === 1 ? jsonResponse(GEMINI_503_BODY, 503) : geminiOk()),
      claude: claudeOk,
    });

    const res = await handler(translateRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get('x-ai-provider')).toBe('gemini');
    expect(calls.map((c) => c.host)).toEqual(['gemini', 'gemini']);
  });

  it('both providers out of credits: AI_BILLING naming both', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-claude-key');
    const calls = mockFetch({
      gemini: () => jsonResponse(GEMINI_402_BODY, 402),
      claude: () =>
        claudeError(402, 'billing_error', 'Your credit balance is too low to access the Anthropic API.'),
    });

    const res = await handler(translateRequest());
    const body = (await res.json()) as { errorCode: string; detail: string };

    expect(res.status).toBe(503);
    expect(body.errorCode).toBe('AI_BILLING');
    expect(body.detail).toBe('Gemini: out of credits (HTTP 402) · Claude: out of credits (HTTP 402)');
    expect(calls.map((c) => c.host)).toEqual(['gemini', 'claude']);
  });

  it('Claude overloaded (529) is retried once', async () => {
    vi.stubEnv('AI_PROVIDER', 'claude');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-claude-key');
    let n = 0;
    const calls = mockFetch({
      claude: () => (++n === 1 ? claudeError(529, 'overloaded_error', 'Overloaded') : claudeOk()),
    });

    const res = await handler(translateRequest());

    expect(res.status).toBe(200);
    expect(calls.map((c) => c.host)).toEqual(['claude', 'claude']);
  });

  it('GET ?health=1 reports each provider separately', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-claude-key');
    mockFetch({
      gemini: () => jsonResponse(GEMINI_402_BODY, 402),
      claude: claudeOk,
    });

    const res = await handler(new Request('https://note.example/api/translate?health=1'));
    const body = (await res.json()) as {
      chain: string[];
      providers: Array<{ provider: string; ok?: boolean; kind?: string; status?: number }>;
    };

    expect(res.status).toBe(200);
    expect(body.chain).toEqual(['gemini', 'claude']);
    expect(body.providers).toMatchObject([
      { provider: 'gemini', ok: false, kind: 'billing', status: 402 },
      { provider: 'claude', ok: true },
    ]);
  });

  it('only transient failures everywhere: AI_BUSY', async () => {
    mockFetch({ gemini: () => jsonResponse(GEMINI_503_BODY, 503) });

    const res = await handler(translateRequest());
    const body = (await res.json()) as { errorCode: string };

    expect(res.status).toBe(503);
    expect(body.errorCode).toBe('AI_BUSY');
  });
});
