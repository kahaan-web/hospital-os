import { en, type WebDictionary } from './en';

function lookup(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Translator for web-only wizard strings; `{token}` placeholders are replaced from `params`. */
export function wt(key: string, params?: Record<string, string | number>): string {
  const template = lookup(en, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

export { en, type WebDictionary };
