import { PASSWORD_RULES } from '../../auth/passwordRules';
import { useT } from '../../i18n/useT';

interface Props {
  password: string;
}

/**
 * Live checklist showing which password rules pass / fail.
 * Used inline beneath the password input on the signup form.
 */
export function PasswordStrengthIndicator({ password }: Props) {
  const { t } = useT();
  return (
    <ul className="mt-2 space-y-0.5 text-xs">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li
            key={rule.id}
            className={ok ? 'text-emerald-700' : 'text-stone-500'}
          >
            <span className="inline-block w-4 text-center">
              {ok ? '✓' : '○'}
            </span>
            {t(rule.labelKey)}
          </li>
        );
      })}
    </ul>
  );
}
