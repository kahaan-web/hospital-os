'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';

export type DataTableColumn<T> = {
  id: string;
  header: string;
  accessor: (row: T) => string | number;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
};

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  pageSize?: number;
  searchPlaceholder?: string;
  getRowId: (row: T) => string;
  emptyMessage?: string;
}

type SortDir = 'asc' | 'desc';

export function DataTable<T>({
  data,
  columns,
  pageSize = 10,
  searchPlaceholder = 'Search…',
  getRowId,
  emptyMessage = 'No rows match your filters.',
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = data;
    if (q) {
      rows = data.filter((row) =>
        columns.some((c) => String(c.accessor(row)).toLowerCase().includes(q)),
      );
    }
    if (sortCol) {
      const col = columns.find((c) => c.id === sortCol);
      if (col) {
        rows = [...rows].sort((a, b) => {
          const av = col.accessor(a);
          const bv = col.accessor(b);
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return sortDir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return rows;
  }, [data, columns, query, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const slice = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const toggleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable) return;
    if (sortCol !== col.id) {
      setSortCol(col.id);
      setSortDir('asc');
    } else {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    }
  };

  return (
    <div>
      <div className="hos-table__toolbar">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          style={{ maxWidth: '16rem' }}
        />
        <span className="hos-pagination">
          {filtered.length} row{filtered.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="hos-table-wrap">
        <table className="hos-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.id} scope="col">
                  {col.sortable ? (
                    <button type="button" onClick={() => toggleSort(col)} aria-label={`Sort by ${col.header}`}>
                      {col.header}
                      {sortCol === col.id ? (
                        sortDir === 'asc' ? (
                          <ArrowUp size={14} />
                        ) : (
                          <ArrowDown size={14} />
                        )
                      ) : (
                        <ArrowUpDown size={14} style={{ opacity: 0.4 }} />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--hos-fg-muted)' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              slice.map((row) => (
                <tr key={getRowId(row)}>
                  {columns.map((col) => (
                    <td key={col.id}>{col.render ? col.render(row) : col.accessor(row)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="hos-pagination" style={{ marginTop: 'var(--hos-space-4)', justifyContent: 'flex-end' }}>
        <Button
          variant="secondary"
          size="sm"
          disabled={pageSafe <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span>
          Page {pageSafe} of {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={pageSafe >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
