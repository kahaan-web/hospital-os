'use client';

import { Button, Checkbox, DataTable, EmptyState, Field, Input, PageHeader, Select, Switch, Tabs } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  otGknm2Api,
  type OtDoctorRoleDto,
  type OtResourceDto,
  type OtResourceInput,
  type OtSettingsDto,
  type SpecialRemarkDto,
  type SurgeryMasterDto,
  type SurgeryType,
} from '@/features/clinical/ot/api-gknm2';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';
import { apiGet } from '@/lib/api';
import { OtSectionNav } from './OtSectionNav';

const defaultResource = (): OtResourceInput => ({
  categoryCode: 'OT',
  categoryName: 'Operation Theatre',
  mainCode: '',
  resourceCode: '',
  resourceType: 'medical',
  defaultChargeCode: '',
  defaultServiceCode: '',
  storeCode: '',
  onlineDate: null,
  maxCalendarDays: 30,
  maxHistoryDays: 365,
  overlapAllowed: false,
  maxOverlap: 1,
  printSlips: true,
  sessionCount: 1,
  slotDurationHours: 0,
  slotDurationMinutes: 15,
  bookingStatus: 'active',
  appointmentFor: '',
  sessionStartTime: '08:00',
  sessionEndTime: '20:00',
  otCategory: '',
  otType: '',
  restrictionDays: 1,
  restrictionTime: '17:00',
  active: true,
});

export function MastersScreen() {
  return (
    <>
      <OtSectionNav current="/app/ot/masters" />
      <PageHeader
        title="OT masters"
        description="Surgeries, remarks, doctor roles, theatres and booking settings."
        actions={
          <Link href="/app/ot" className="hos-btn hos-btn--md hos-btn--secondary">
            Back
          </Link>
        }
      />
      <Tabs
        tabs={[
          { value: 'surgeries', label: 'Surgeries', content: <SurgeriesTab /> },
          { value: 'remarks', label: 'Special remarks', content: <RemarksTab /> },
          { value: 'roles', label: 'Doctor roles', content: <DoctorRolesTab /> },
          { value: 'resources', label: 'OT resources', content: <ResourcesTab /> },
          { value: 'settings', label: 'Settings', content: <SettingsTab /> },
        ]}
      />
    </>
  );
}

function SurgeriesTab() {
  const [rows, setRows] = useState<SurgeryMasterDto[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', type: 'major' as SurgeryType, departmentId: '', active: true });
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      otGknm2Api.listSurgeries().catch(() => [] as SurgeryMasterDto[]),
      apiGet<{ id: string; name: string }[]>('/tenant/clinical/departments').catch(() => []),
    ])
      .then(([surg, depts]) => {
        setRows(surg);
        setDepartments(depts);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      const body = { name: form.name.trim(), type: form.type, departmentId: form.departmentId || null, active: form.active };
      if (editId) await otGknm2Api.patchSurgery(editId, body);
      else await otGknm2Api.createSurgery(body);
      setMessage(editId ? 'Surgery updated.' : 'Surgery added.');
      setForm({ name: '', type: 'major', departmentId: '', active: true });
      setEditId(null);
      load();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not save surgery.');
    } finally {
      setBusy(false);
    }
  };

  if (loading && rows.length === 0) return <PageLoading label="Loading surgeries" />;
  if (error && rows.length === 0) return <PageError error={error} onRetry={load} />;

  return (
    <div className="max-w-5xl pt-4">
      {message ? <p role="status" className="mb-3 text-sm">{message}</p> : null}
      <form
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Surgery name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required aria-label="Surgery name" />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as SurgeryType })} aria-label="Surgery type">
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </Select>
        </Field>
        <Field label="Department">
          <Select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} aria-label="Department">
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Active">
          <Checkbox checked={form.active} onCheckedChange={(c) => setForm({ ...form, active: c === true })} label="Active" />
        </Field>
        <h2 className="sr-only">Save surgery</h2>
        <Button type="submit" disabled={busy}>
          {editId ? 'Update' : 'Add'}
        </Button>
        {editId ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setEditId(null);
              setForm({ name: '', type: 'major', departmentId: '', active: true });
            }}
          >
            Cancel edit
          </Button>
        ) : null}
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No surgeries in master" description="Add surgeries here or wait for seed data from the API." />
      ) : (
        <DataTable
          data={rows}
          getRowId={(r) => r.id}
          columns={[
            { id: 'name', header: 'Name', accessor: (r) => r.name },
            { id: 'type', header: 'Type', accessor: (r) => r.type },
            { id: 'dept', header: 'Department', accessor: (r) => r.departmentName ?? '—' },
            { id: 'active', header: 'Active', accessor: (r) => (r.active ? 'Yes' : 'No') },
            {
              id: 'edit',
              header: '',
              accessor: () => '',
              render: (r) => (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditId(r.id);
                    setForm({
                      name: r.name,
                      type: r.type,
                      departmentId: r.departmentId ?? '',
                      active: r.active,
                    });
                  }}
                >
                  Edit
                </Button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

function RemarksTab() {
  const [rows, setRows] = useState<SpecialRemarkDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    otGknm2Api
      .listSpecialRemarks()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!text.trim()) return;
    try {
      await otGknm2Api.createSpecialRemark(text.trim());
      setText('');
      setMessage('Remark added.');
      load();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not add remark.');
    }
  };

  if (loading) return <PageLoading label="Loading remarks" />;

  return (
    <div className="max-w-3xl pt-4">
      {message ? <p role="status" className="mb-3 text-sm">{message}</p> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <Field label="New remark" className="min-w-[16rem] flex-1">
          <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="Special remark" />
        </Field>
        <Button type="button" onClick={() => void add()}>
          Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No special remarks" />
      ) : (
        <ul className="divide-y rounded border" style={{ borderColor: 'var(--hos-line)' }}>
          {rows.map((r) => (
            <li key={r.id} className="px-3 py-2 text-sm">
              {r.text} {!r.active ? '(inactive)' : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DoctorRolesTab() {
  const [rows, setRows] = useState<OtDoctorRoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    otGknm2Api
      .listDoctorRoles()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (row: OtDoctorRoleDto, field: 'surgeon' | 'anaesthetist', next: boolean) => {
    setBusyId(row.doctorId);
    try {
      await otGknm2Api.setDoctorRoles(row.doctorId, {
        surgeon: field === 'surgeon' ? next : row.surgeon,
        anaesthetist: field === 'anaesthetist' ? next : row.anaesthetist,
      });
      load();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not update role.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <PageLoading label="Loading doctors" />;

  return (
    <div className="max-w-4xl pt-4">
      {message ? <p role="status" className="mb-3 text-sm">{message}</p> : null}
      {rows.length === 0 ? (
        <EmptyState title="No doctors" description="Doctor roles API may still be deploying." />
      ) : (
        <DataTable
          data={rows}
          getRowId={(r) => r.doctorId}
          columns={[
            { id: 'name', header: 'Doctor', accessor: (r) => r.name },
            {
              id: 'surgeon',
              header: 'Surgeon',
              accessor: (r) => (r.surgeon ? 'Yes' : 'No'),
              render: (r) => (
                <Switch
                  checked={r.surgeon}
                  disabled={busyId === r.doctorId}
                  onCheckedChange={(v) => void toggle(r, 'surgeon', v)}
                  aria-label={`Surgeon role for ${r.name}`}
                />
              ),
            },
            {
              id: 'anes',
              header: 'Anaesthetist',
              accessor: (r) => (r.anaesthetist ? 'Yes' : 'No'),
              render: (r) => (
                <Switch
                  checked={r.anaesthetist}
                  disabled={busyId === r.doctorId}
                  onCheckedChange={(v) => void toggle(r, 'anaesthetist', v)}
                  aria-label={`Anaesthetist role for ${r.name}`}
                />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

function ResourcesTab() {
  const [rows, setRows] = useState<OtResourceDto[]>([]);
  const [form, setForm] = useState<OtResourceInput>(defaultResource());
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    otGknm2Api
      .listResources()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (partial: Partial<OtResourceInput>) => setForm((prev) => ({ ...prev, ...partial }));

  const save = async () => {
    if (!form.resourceCode.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      if (editId) await otGknm2Api.patchResource(editId, form);
      else await otGknm2Api.createResource(form);
      setMessage(editId ? 'Resource updated.' : 'Resource added.');
      setForm(defaultResource());
      setEditId(null);
      load();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not save resource.');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (row: OtResourceDto) => {
    setEditId(row.id);
    const { id: _id, ...rest } = row;
    setForm(rest);
  };

  if (loading && rows.length === 0) return <PageLoading label="Loading OT resources" />;

  return (
    <div className="max-w-5xl pt-4">
      {message ? <p role="status" className="mb-3 text-sm">{message}</p> : null}
      <ResourceForm form={form} patch={patch} busy={busy} editId={editId} onSave={() => void save()} onCancel={() => { setEditId(null); setForm(defaultResource()); }} />
      {rows.length === 0 ? (
        <EmptyState title="No OT resources" description="Add operation theatres per resource master §14." />
      ) : (
        <DataTable
          data={rows}
          getRowId={(r) => r.id}
          columns={[
            { id: 'code', header: 'Resource', accessor: (r) => r.resourceCode },
            { id: 'cat', header: 'Category', accessor: (r) => r.categoryName },
            { id: 'overlap', header: 'Overlap', accessor: (r) => (r.overlapAllowed ? `Yes (max ${r.maxOverlap})` : 'No') },
            { id: 'sessions', header: 'Sessions', accessor: (r) => String(r.sessionCount) },
            { id: 'slot', header: 'Slot', accessor: (r) => `${r.slotDurationHours}h ${r.slotDurationMinutes}m` },
            {
              id: 'edit',
              header: '',
              accessor: () => '',
              render: (r) => (
                <Button type="button" variant="ghost" onClick={() => startEdit(r)}>
                  Edit
                </Button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

function ResourceForm({
  form,
  patch,
  busy,
  editId,
  onSave,
  onCancel,
}: {
  form: OtResourceInput;
  patch: (p: Partial<OtResourceInput>) => void;
  busy: boolean;
  editId: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h2 className="col-span-full text-base font-semibold">{editId ? 'Edit OT resource' : 'Add OT resource'}</h2>
      <Field label="Category code">
        <Input value={form.categoryCode} onChange={(e) => patch({ categoryCode: e.target.value })} />
      </Field>
      <Field label="Category name">
        <Input value={form.categoryName} onChange={(e) => patch({ categoryName: e.target.value })} />
      </Field>
      <Field label="Main code">
        <Input value={form.mainCode} onChange={(e) => patch({ mainCode: e.target.value })} />
      </Field>
      <Field label="Resource" required>
        <Input value={form.resourceCode} onChange={(e) => patch({ resourceCode: e.target.value })} required aria-label="Resource code" />
      </Field>
      <Field label="Resource type">
        <Select value={form.resourceType} onChange={(e) => patch({ resourceType: e.target.value as OtResourceInput['resourceType'] })}>
          <option value="medical">Medical</option>
          <option value="non_medical">Non Medical</option>
        </Select>
      </Field>
      <Field label="Default charge code">
        <Input value={form.defaultChargeCode} onChange={(e) => patch({ defaultChargeCode: e.target.value })} />
      </Field>
      <Field label="Default service code">
        <Input value={form.defaultServiceCode} onChange={(e) => patch({ defaultServiceCode: e.target.value })} />
      </Field>
      <Field label="Store code">
        <Input value={form.storeCode} onChange={(e) => patch({ storeCode: e.target.value })} />
      </Field>
      <Field label="Online date">
        <Input type="date" value={form.onlineDate ?? ''} onChange={(e) => patch({ onlineDate: e.target.value || null })} />
      </Field>
      <Field label="Max calendar period (days)">
        <Input type="number" min={1} value={form.maxCalendarDays} onChange={(e) => patch({ maxCalendarDays: Number(e.target.value) })} />
      </Field>
      <Field label="Max history period (days)">
        <Input type="number" min={1} value={form.maxHistoryDays} onChange={(e) => patch({ maxHistoryDays: Number(e.target.value) })} />
      </Field>
      <Field label="Overlap allowed">
        <Checkbox checked={form.overlapAllowed} onCheckedChange={(c) => patch({ overlapAllowed: c === true })} label="Yes" />
      </Field>
      <Field label="Max overlap count">
        <Input type="number" min={0} value={form.maxOverlap} onChange={(e) => patch({ maxOverlap: Number(e.target.value) })} />
      </Field>
      <Field label="Print slips">
        <Checkbox checked={form.printSlips} onCheckedChange={(c) => patch({ printSlips: c === true })} label="Yes" />
      </Field>
      <Field label="No. of sessions">
        <Input type="number" min={1} value={form.sessionCount} onChange={(e) => patch({ sessionCount: Number(e.target.value) })} />
      </Field>
      <Field label="Slot duration (hours)">
        <Input type="number" min={0} value={form.slotDurationHours} onChange={(e) => patch({ slotDurationHours: Number(e.target.value) })} />
      </Field>
      <Field label="Slot duration (minutes)">
        <Input type="number" min={0} value={form.slotDurationMinutes} onChange={(e) => patch({ slotDurationMinutes: Number(e.target.value) })} />
      </Field>
      <Field label="Appointment booking status">
        <Select value={form.bookingStatus} onChange={(e) => patch({ bookingStatus: e.target.value as OtResourceInput['bookingStatus'] })}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>
      <Field label="Appointment for" hint="OPEN – confirm with Ajay Sheth">
        <Input value={form.appointmentFor} onChange={(e) => patch({ appointmentFor: e.target.value })} />
      </Field>
      <Field label="Session start time">
        <Input type="time" value={form.sessionStartTime} onChange={(e) => patch({ sessionStartTime: e.target.value })} />
      </Field>
      <Field label="Session end time">
        <Input type="time" value={form.sessionEndTime} onChange={(e) => patch({ sessionEndTime: e.target.value })} />
      </Field>
      <Field label="OT category">
        <Input value={form.otCategory} onChange={(e) => patch({ otCategory: e.target.value })} />
      </Field>
      <Field label="OT type">
        <Input value={form.otType} onChange={(e) => patch({ otType: e.target.value })} />
      </Field>
      <Field label="Restriction lead days">
        <Input type="number" min={0} value={form.restrictionDays} onChange={(e) => patch({ restrictionDays: Number(e.target.value) })} />
      </Field>
      <Field label="Restriction cutoff time">
        <Input type="time" value={form.restrictionTime} onChange={(e) => patch({ restrictionTime: e.target.value })} />
      </Field>
      <Field label="Active">
        <Checkbox checked={form.active} onCheckedChange={(c) => patch({ active: c === true })} label="Active" />
      </Field>
      <h2 className="sr-only">Save resource</h2>
      <div className="col-span-full flex gap-2">
        <Button type="submit" disabled={busy}>
          {editId ? 'Update resource' : 'Add resource'}
        </Button>
        {editId ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function SettingsTab() {
  const [settings, setSettings] = useState<OtSettingsDto>({ cutoffTime: '17:00', minLeadDays: 1, emergencyBypass: true });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    otGknm2Api
      .getSettings()
      .then(setSettings)
      .catch(() => setSettings({ cutoffTime: '17:00', minLeadDays: 1, emergencyBypass: true }))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const saved = await otGknm2Api.saveSettings(settings);
      setSettings(saved);
      setMessage('Settings saved.');
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoading label="Loading settings" />;

  return (
    <form
      className="max-w-md pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {message ? <p role="status" className="mb-3 text-sm">{message}</p> : null}
      <Field label="Booking cutoff time" hint="After this time, minimum lead days apply (CR P5-11).">
        <Input type="time" value={settings.cutoffTime} onChange={(e) => setSettings({ ...settings, cutoffTime: e.target.value })} />
      </Field>
      <Field label="Minimum lead days">
        <Input
          type="number"
          min={0}
          value={settings.minLeadDays}
          onChange={(e) => setSettings({ ...settings, minLeadDays: Number(e.target.value) })}
        />
      </Field>
      <Field label="Emergency bypass">
        <Checkbox
          checked={settings.emergencyBypass}
          onCheckedChange={(c) => setSettings({ ...settings, emergencyBypass: c === true })}
          label="Allow emergency bookings after cutoff"
        />
      </Field>
      <Button type="submit" disabled={busy} className="mt-2">
        Save settings
      </Button>
    </form>
  );
}
