/** Route schemas captured at registration so tests can build a body that reaches the handler. */
const bags = new Map<string, { body?: unknown; querystring?: unknown; params?: unknown }>();

export function rememberRouteSchema(
  method: string,
  url: string,
  schema: { body?: unknown; querystring?: unknown; params?: unknown } | undefined,
): void {
  bags.set(`${method.toUpperCase()} ${url}`, schema ?? {});
}

export function routeSchemaBag(method: string, url: string): { body?: unknown; querystring?: unknown; params?: unknown } | undefined {
  return bags.get(`${method.toUpperCase()} ${url}`);
}
