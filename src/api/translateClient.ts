import type { TranslateResponse, TranslationDirection } from '../types/dictionary';
import { supabase } from '../auth/supabaseClient';

export class TranslateError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'TranslateError';
  }
}

/**
 * Hit /api/translate, attaching the caller's Supabase JWT when one
 * exists.  Anonymous callers (no session) are allowed — the server
 * accepts them so visitors can try the dictionary without registering.
 * When a session IS present we attach the token so the server can
 * reject expired credentials cleanly instead of silently downgrading
 * the user to anon mode.
 *
 * Client-side timeout is set to 35 s.  Vercel Edge Functions on the
 * Hobby tier are killed by the platform at 25 s, but in practice the
 * browser doesn't always see that termination as a clean error —
 * especially in flaky networks the connection can sit half-open for
 * minutes.  The AbortController guarantees the promise resolves
 * (with a TimeoutError) within a bounded time, so the spinner can't
 * spin forever.
 */
const REQUEST_TIMEOUT_MS = 35_000;

export async function translateWord(
  word: string,
  language: string,
  direction: TranslationDirection = 'zh-to-other',
): Promise<TranslateResponse> {
  // getSession() returns whatever the client has cached locally.  With
  // autoRefreshToken: true (set in supabaseClient), the access_token is
  // kept fresh on a timer — we don't need to manually call refreshSession
  // before each request.  If the token is still expired (e.g. tab was
  // sleeping), the server returns 401 and the user gets the "please sign
  // in again" message naturally.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (session) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  // Abort the fetch if it stalls past the timeout.  This guards against
  // the case where Vercel's 25 s edge timeout fires server-side but the
  // browser keeps the connection half-open indefinitely — which is what
  // makes the SearchBox sit on "查询中…" forever.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('/api/translate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ word, language, direction }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new TranslateError(
        `查询超时（${REQUEST_TIMEOUT_MS / 1000}s）。AI 可能正忙，请稍后再试，或换个简短一点的输入。`,
        408,
      );
    }
    // Network failure (DNS, offline, mid-flight connection drop, …).
    const msg = err instanceof Error ? err.message : String(err);
    throw new TranslateError(`网络请求失败：${msg}`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* body wasn't JSON */
    }
    throw new TranslateError(detail, res.status);
  }

  const data = (await res.json()) as TranslateResponse;
  if (!data?.meanings?.length) {
    throw new TranslateError('AI 返回的数据格式不完整');
  }
  // Forward direction MUST have wordSyllables. Reverse direction may have empty array.
  if (direction === 'zh-to-other' && !data.wordSyllables?.length) {
    throw new TranslateError('AI 返回的数据格式不完整');
  }
  return data;
}
