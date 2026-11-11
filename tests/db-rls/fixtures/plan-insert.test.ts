import { describe, expect, it } from 'vitest';
import { creditNumber, planRequiredInsert, stringChoices } from './plan-insert';
import type { ColumnMeta, FkRef, InsertHints } from './types';

const hints: InsertHints = {
  table: 'credit_notes',
  tag: 'alpha',
  email: 'alpha.credit@sbx',
  mobile: '9000011991',
  label: 'Sample credit note (Sample)',
};

function col(partial: Partial<ColumnMeta> & Pick<ColumnMeta, 'name' | 'dataType'>): ColumnMeta {
  return {
    udtName: partial.dataType,
    nullable: false,
    hasDefault: false,
    generated: false,
    identity: false,
    ...partial,
  };
}

const checks = [
  'CHECK ((char_length(number) <= 16))',
  "CHECK ((status = ANY (ARRAY['issued'::text, 'void'::text])))",
  'CHECK ((taxable_paise >= 0))',
  'CHECK ((total_paise > 0))',
];

const fks: FkRef[] = [
  { column: 'tenant_id', parentTable: 'tenants', parentColumn: 'id' },
  { column: 'invoice_id', parentTable: 'invoices', parentColumn: 'id' },
];

describe('credit note insert planner', () => {
  it('reads IN / ANY / equality literals for one column', () => {
    expect(stringChoices("CHECK ((status = ANY (ARRAY['issued'::text, 'void'::text])))", 'status')).toEqual(['issued', 'void']);
    expect(stringChoices("CHECK ((kind IN ('full', 'partial')))", 'kind')).toEqual(['full', 'partial']);
    expect(stringChoices("CHECK ((currency = 'INR'))", 'currency')).toEqual(['INR']);
    expect(stringChoices('CHECK ((char_length(number) <= 16))', 'number')).toEqual([]);
  });

  it('fills required columns and leaves defaults alone', () => {
    const columns = [
      col({ name: 'id', dataType: 'uuid', hasDefault: true }),
      col({ name: 'tenant_id', dataType: 'uuid' }),
      col({ name: 'invoice_id', dataType: 'uuid' }),
      col({ name: 'number', dataType: 'text' }),
      col({ name: 'status', dataType: 'text', hasDefault: true }),
      col({ name: 'reason', dataType: 'text', nullable: true }),
      col({ name: 'issue_date', dataType: 'date' }),
      col({ name: 'taxable_paise', dataType: 'bigint' }),
      col({ name: 'total_paise', dataType: 'bigint' }),
      col({ name: 'full_name', dataType: 'text', generated: true }),
    ];
    const plan = planRequiredInsert(columns, checks, fks, hints);
    expect(plan).toEqual([
      { column: 'tenant_id', kind: 'tenant' },
      { column: 'invoice_id', kind: 'fk', parentTable: 'invoices', parentColumn: 'id' },
      { column: 'number', kind: 'param', value: 'CNA/2627/000001' },
      { column: 'issue_date', kind: 'sql', expr: 'current_date' },
      { column: 'taxable_paise', kind: 'param', value: 1 },
      { column: 'total_paise', kind: 'param', value: 1 },
    ]);
  });

  it('keeps the two probe tenants on different numbers and honours a short length check', () => {
    expect(creditNumber('alpha', 16)).toBe('CNA/2627/000001');
    expect(creditNumber('beta', 16)).toBe('CNB/2627/000001');
    expect(creditNumber('alpha', 8)).toBe('CNA/2627');
  });

  it('refuses a required self-reference', () => {
    const columns = [col({ name: 'tenant_id', dataType: 'uuid' }), col({ name: 'reversal_of_id', dataType: 'uuid' })];
    const self: FkRef[] = [{ column: 'reversal_of_id', parentTable: 'credit_notes', parentColumn: 'id' }];
    expect(() => planRequiredInsert(columns, [], self, hints)).toThrow(/self-reference/);
  });
});
