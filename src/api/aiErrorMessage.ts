import { translate, type StringKey, type UILang } from '../i18n';

const CODE_TO_KEY: Record<string, StringKey> = {
  AI_BILLING: 'aiErrorBilling',
  AI_AUTH: 'aiErrorAuth',
  AI_BUSY: 'aiErrorBusy',
  AI_FAILED: 'aiErrorFailed',
};

/**
 * Localized message for an /api/translate failure code, with the
 * server's per-provider detail appended.  Returns null for unknown or
 * missing codes so the caller can fall back to the raw server message.
 */
export function localizeAiError(
  lang: UILang,
  code: string | undefined,
  detail: string | undefined,
): string | null {
  const key = code ? CODE_TO_KEY[code] : undefined;
  if (!key) return null;
  const headline = translate(lang, key);
  return detail ? `${headline} (${detail})` : headline;
}
