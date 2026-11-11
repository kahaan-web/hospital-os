'use client';

import { createTranslator, WARD_TYPES, type BedDto, type WardType } from '@hos/shared';
import { Badge, Button, DataTable, Field, Input, PageHeader, Select } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { adtApi } from '@/features/clinical/adt/api';
import { AdtLinks, statusLabel } from '@/features/clinical/adt/links';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');

export default function MastersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [wards, setWards] = useState<{ id: string; code: string; name: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; wardId: string; code: string; name: string }[]>([]);
  const [beds, setBeds] = useState<BedDto[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [ward, setWard] = useState({ code: '', name: '', wardType: 'general' as WardType, isIcu: false, bedServiceId: '' });
  const [room, setRoom] = useState({ wardId: '', code: '', name: '' });
  const [bed, setBed] = useState({ roomId: '', label: '', wardClass: 'general' as WardType });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([adtApi.wards(), adtApi.rooms(), adtApi.beds(), adtApi.bedServices()])
      .then(([wardRows, roomRows, bedRows, serviceRows]) => {
        setWards(wardRows.map((row) => ({ id: row.id, code: row.code, name: row.name })));
        setRooms(roomRows);
        setBeds(bedRows);
        setServices(serviceRows.map((row) => ({ id: row.id, name: `${row.code} · ${row.name}` })));
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      setMessage(done);
      load();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  if (loading && wards.length === 0 && beds.length === 0) return <PageLoading label="Loading wards" />;
  if (error && wards.length === 0) return <PageError error={error} onRetry={load} />;

  const roomLabel = (roomId: string) => {
    const row = rooms.find((item) => item.id === roomId);
    const wardRow = wards.find((item) => item.id === row?.wardId);
    return row ? `${wardRow?.code ?? ''} ${row.code}`.trim() : '—';
  };

  return (
    <>
      <AdtLinks current="/app/adt/masters" />
      <PageHeader title={t('clinical.adt.masters')} description="Wards, rooms and beds for this location." />
      {message ? (
        <p className="mb-3 text-sm" role="status">
          {message}
        </p>
      ) : null}
      <div className="mb-8 grid max-w-5xl gap-6 md:grid-cols-3">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                adtApi.createWard({
                  ...ward,
                  isIcu: ward.isIcu || ward.wardType === 'icu' || ward.wardType === 'nicu',
                  bedServiceId: ward.bedServiceId || null,
                }),
              'Ward added',
            );
          }}
        >
          <h2 className="text-lg font-semibold">{t('clinical.adt.addWard')}</h2>
          <Field label={t('clinical.adt.code')} required>
            <Input value={ward.code} onChange={(event) => setWard({ ...ward, code: event.target.value })} required maxLength={8} aria-label="Ward code" />
          </Field>
          <Field label={t('clinical.adt.name')} required>
            <Input value={ward.name} onChange={(event) => setWard({ ...ward, name: event.target.value })} required aria-label="Ward name" />
          </Field>
          <Field label={t('clinical.adt.wardType')}>
            <Select value={ward.wardType} onChange={(event) => setWard({ ...ward, wardType: event.target.value as WardType })} aria-label={t('clinical.adt.wardType')}>
              {WARD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ward.isIcu} onChange={(event) => setWard({ ...ward, isIcu: event.target.checked })} />
            {t('clinical.adt.icu')}
          </label>
          <Field label={t('clinical.adt.bedService')}>
            <Select value={ward.bedServiceId} onChange={(event) => setWard({ ...ward, bedServiceId: event.target.value })} aria-label={t('clinical.adt.bedService')}>
              <option value="">None</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={busy}>
            {t('clinical.adt.addWard')}
          </Button>
        </form>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => adtApi.createRoom(room), 'Room added');
          }}
        >
          <h2 className="text-lg font-semibold">{t('clinical.adt.addRoom')}</h2>
          <Field label={t('clinical.adt.ward')} required>
            <Select value={room.wardId} required onChange={(event) => setRoom({ ...room, wardId: event.target.value })} aria-label={t('clinical.adt.ward')}>
              <option value="">Choose a ward</option>
              {wards.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} · {row.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('clinical.adt.code')} required>
            <Input value={room.code} required maxLength={8} onChange={(event) => setRoom({ ...room, code: event.target.value })} aria-label="Room code" />
          </Field>
          <Field label={t('clinical.adt.name')} required>
            <Input value={room.name} required onChange={(event) => setRoom({ ...room, name: event.target.value })} aria-label="Room name" />
          </Field>
          <Button type="submit" disabled={busy}>
            {t('clinical.adt.addRoom')}
          </Button>
        </form>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => adtApi.createBed(bed), 'Bed added');
          }}
        >
          <h2 className="text-lg font-semibold">{t('clinical.adt.addBed')}</h2>
          <Field label={t('clinical.adt.room')} required>
            <Select value={bed.roomId} required onChange={(event) => setBed({ ...bed, roomId: event.target.value })} aria-label={t('clinical.adt.room')}>
              <option value="">Choose a room</option>
              {rooms.map((row) => (
                <option key={row.id} value={row.id}>
                  {roomLabel(row.id)} · {row.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('clinical.adt.label')} required hint="For example GW-1">
            <Input value={bed.label} required maxLength={20} onChange={(event) => setBed({ ...bed, label: event.target.value })} aria-label={t('clinical.adt.label')} />
          </Field>
          <Field label={t('clinical.adt.wardClass')}>
            <Select value={bed.wardClass} onChange={(event) => setBed({ ...bed, wardClass: event.target.value as WardType })} aria-label={t('clinical.adt.wardClass')}>
              {WARD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={busy}>
            {t('clinical.adt.addBed')}
          </Button>
        </form>
      </div>
      <DataTable
        data={beds}
        getRowId={(row) => row.id}
        pageSize={50}
        emptyMessage="No beds yet. Add a ward, a room, then a bed."
        columns={[
          { id: 'room', header: t('clinical.adt.room'), accessor: (row) => roomLabel(row.roomId) },
          { id: 'label', header: t('clinical.adt.label'), accessor: (row) => row.label },
          { id: 'class', header: t('clinical.adt.wardClass'), accessor: (row) => row.wardClass.replaceAll('_', ' ') },
          {
            id: 'status',
            header: t('clinical.adt.status'),
            accessor: (row) => statusLabel(row.status),
            render: (row) => <Badge tone={row.status === 'vacant' ? 'success' : row.status === 'occupied' ? 'info' : 'warning'}>{statusLabel(row.status)}</Badge>,
          },
          {
            id: 'change',
            header: '',
            accessor: () => '',
            render: (row) => (
              <Select
                aria-label={`Status for ${row.label}`}
                value={row.status}
                disabled={busy || row.status === 'occupied'}
                onChange={(event) => void run(() => adtApi.patchBed(row.id, event.target.value as BedDto['status']), 'Bed updated')}
              >
                {(['vacant', 'housekeeping', 'maintenance', 'blocked'] as const).map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
                {row.status === 'occupied' ? <option value="occupied">{statusLabel('occupied')}</option> : null}
              </Select>
            ),
          },
        ]}
      />
    </>
  );
}
