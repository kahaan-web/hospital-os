export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function listItems<T>(data: T[] | Paged<T>): T[] {
  return Array.isArray(data) ? data : data.items;
}
