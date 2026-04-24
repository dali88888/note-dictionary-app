import type { TranslateResponse } from '../types/dictionary';

export class TranslateError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'TranslateError';
  }
}

export async function translateWord(
  word: string,
  language: string,
): Promise<TranslateResponse> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, language }),
  });

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
  if (!data?.meanings?.length || !data.wordSyllables?.length) {
    throw new TranslateError('AI 返回的数据格式不完整');
  }
  return data;
}
