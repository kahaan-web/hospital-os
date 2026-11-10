/** Returns a copy of `errors` without `field` (for clearing field-level messages). */
export function withoutField(errors: Record<string, string>, field: string): Record<string, string> {
  const { [field]: _, ...rest } = errors;
  return rest;
}
