import { describe, expect, it } from 'vitest';
import { denial } from './helpers';

describe('write rejection classification', () => {
  it('treats privilege, RLS, append-only, and immutability triggers as rejections', () => {
    expect(denial({ ok: false, code: '42501', message: 'permission denied for table invoices' })).toBe('privilege');
    expect(denial({ ok: false, code: '42501', message: 'permission denied for column tenant_id' })).toBe('privilege');
    expect(denial({ ok: false, code: '42501', message: 'new row violates row-level security policy for table "invoices"' })).toBe('rls');
    expect(denial({ ok: false, code: '42501', message: 'audit_log is append-only' })).toBe('append-only');
    expect(denial({ ok: false, code: '42501', message: 'vital_signs is append-only' })).toBe('append-only');
    expect(denial({ ok: false, code: '42501', message: 'vital_signs can only be marked entered in error' })).toBe('trigger');
    expect(denial({ ok: false, code: 'P0001', message: 'invoices are immutable' })).toBe('trigger');
    expect(denial({ ok: false, code: '23505', message: 'duplicate key value violates unique constraint' })).toBeNull();
    expect(denial({ ok: true, rowCount: 0, rows: [] })).toBeNull();
  });
});
