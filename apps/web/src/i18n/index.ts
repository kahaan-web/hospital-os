/**
 * Web onboarding translator. Copy lives in `en.ts` (wizard-only strings).
 * `@hos/shared` `createTranslator` covers shell, nav and module tiles — kept separate so onboarding copy can ship
 * without pulling the full product dictionary into every wizard page.
 */
import { en, type WebDictionary, type WebMessageKey } from './en';

function lookup(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Translator for web wizard strings; `{token}` placeholders are replaced from `params`. */
export function wt(key: WebMessageKey, params?: Record<string, string | number>): string {
  const template = lookup(en, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

export { en, type WebDictionary, type WebMessageKey };
