/** Nav highlight: exact match for section roots; prefix match for nested routes. */
export function isNavActive(activePath: string | undefined, href: string): boolean {
  if (!activePath) return false;
  if (href === '/app' || href === '/admin') return activePath === href;
  return activePath === href || activePath.startsWith(`${href}/`);
}
