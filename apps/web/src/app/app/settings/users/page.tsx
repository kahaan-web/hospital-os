'use client';

import type { RoleDto, UserDto } from '@hos/shared';
import { fieldErrors, inviteUserSchema } from '@hos/shared';
import { Button, DataTable, Dialog, Field, Input, PageHeader, Select, useToast } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { listItems, type Paged } from '@/lib/lists';
import { ApiError, apiGet, apiPost } from '@/lib/api';

export default function UsersSettingsPage() {
  const toast = useToast();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', roleKey: '', locationIds: [] as string[] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiGet<UserDto[] | Paged<UserDto>>('/tenant/users'),
      apiGet<RoleDto[]>('/tenant/roles'),
      apiGet<{ id: string; name: string }[]>('/tenant/locations'),
    ])
      .then(([u, r, l]) => {
        setUsers(listItems(u));
        setRoles(r);
        setLocations(l);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const invite = async () => {
    const parsed = inviteUserSchema.safeParse({
      name: form.name,
      email: form.email,
      roleKey: form.roleKey,
      locationIds: form.locationIds.length ? form.locationIds : null,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      await apiPost('/tenant/users/invite', parsed.data);
      toast.toast({ tone: 'success', title: 'Invite sent (mock)' });
      setOpen(false);
      load();
    } catch (e) {
      setErrors(e instanceof ApiError ? { form: e.message } : { form: 'Invite failed' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Users"
        description="Invite staff with a role and location scope."
        actions={
          <Button type="button" onClick={() => setOpen(true)}>
            Invite user
          </Button>
        }
      />
      <DataTable
        data={users}
        getRowId={(u) => u.id}
        columns={[
          { id: 'name', header: 'Name', accessor: (u) => u.name },
          { id: 'email', header: 'Email', accessor: (u) => u.email },
          { id: 'status', header: 'Status', accessor: (u) => u.status },
          {
            id: 'roles',
            header: 'Roles',
            accessor: (u) => u.roles.map((r) => r.roleName).join(', ') || '—',
          },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen} title="Invite user">
        <Field label="Name" error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </Field>
        <Field label="Role" error={errors.roleKey}>
          <Select value={form.roleKey} onChange={(e) => setForm((f) => ({ ...f, roleKey: e.target.value }))}>
            <option value="">Choose role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.key}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Locations" hint="Leave empty for tenant-wide role">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-2)' }}>
            {locations.map((l) => (
              <label key={l.id} style={{ display: 'flex', gap: 'var(--hos-space-2)', fontSize: 'var(--hos-text-sm)' }}>
                <input
                  type="checkbox"
                  checked={form.locationIds.includes(l.id)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      locationIds: e.target.checked
                        ? [...f.locationIds, l.id]
                        : f.locationIds.filter((id) => id !== l.id),
                    }))
                  }
                />
                {l.name}
              </label>
            ))}
          </div>
        </Field>
        {errors.form ? <p style={{ color: 'var(--hos-fg-danger)' }}>{errors.form}</p> : null}
        <Button type="button" onClick={invite} loading={busy} style={{ marginTop: 'var(--hos-space-4)' }}>
          Send invite
        </Button>
      </Dialog>
    </>
  );
}
