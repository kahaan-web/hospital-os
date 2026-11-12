'use client';

import type { PatientSummaryDto } from '@hos/shared';
import { createTranslator, formatDate } from '@hos/shared';
import { Badge, Button, DataTable, EmptyState, Field, Input, PageHeader, Select } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PatientPicker } from '@/features/clinical/common/PatientPicker';
import {
  bloodBankApi,
  COMPONENT_LABEL,
  type BbAbo,
  type BbComponent,
  type BbRequestRow,
  type BbRh,
  type BbUnit,
} from '@/features/clinical/mvp/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');
const ABO: BbAbo[] = ['A', 'B', 'AB', 'O'];
const COMPONENTS = Object.keys(COMPONENT_LABEL) as BbComponent[];
const group = (abo: string, rh: string) => `${abo} ${rh === 'pos' ? '+' : '−'}`;
const addDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export default function BloodBankPage() {
  const [units, setUnits] = useState<BbUnit[]>([]);
  const [requests, setRequests] = useState<BbRequestRow[]>([]);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const [unitNo, setUnitNo] = useState('');
  const [component, setComponent] = useState<BbComponent>('prbc');
  const [abo, setAbo] = useState<BbAbo>('O');
  const [rh, setRh] = useState<BbRh>('pos');
  const [volumeMl, setVolumeMl] = useState('280');
  const [collectedOn, setCollectedOn] = useState(addDays(0));
  const [expiresAt, setExpiresAt] = useState(addDays(35));
  const [sourceCentre, setSourceCentre] = useState('');
  const [ttiCleared, setTtiCleared] = useState('yes');

  const [patient, setPatient] = useState<PatientSummaryDto | null>(null);
  const [reqComponent, setReqComponent] = useState<BbComponent>('prbc');
  const [pAbo, setPAbo] = useState<BbAbo>('O');
  const [pRh, setPRh] = useState<BbRh>('pos');
  const [urgency, setUrgency] = useState('routine');
  const [indication, setIndication] = useState('');

  const load = useCallback(() => {
    Promise.all([bloodBankApi.inventory(), bloodBankApi.requests()])
      .then(([inv, reqs]) => {
        setUnits(inv.units);
        setToday(inv.today);
        setRequests(reqs);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fail = (err: unknown, fallback: string) => setFormError(err instanceof ApiError ? err.message : fallback);

  const receive = async () => {
    setBusy(true);
    setFormError('');
    try {
      await bloodBankApi.receive({
        unitNo: unitNo.trim(),
        component,
        abo,
        rh,
        volumeMl: Number(volumeMl),
        collectedOn,
        expiresAt,
        sourceCentre: sourceCentre.trim(),
        ttiCleared: ttiCleared === 'yes',
      });
      setUnitNo('');
      load();
    } catch (err) {
      fail(err, 'Could not receive the unit');
    } finally {
      setBusy(false);
    }
  };

  const createRequest = async () => {
    if (!patient) {
      setFormError('Choose a patient first');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await bloodBankApi.createRequest({ patientId: patient.id, patientAbo: pAbo, patientRh: pRh, component: reqComponent, urgency, indication });
      setPatient(null);
      setIndication('');
      load();
    } catch (err) {
      fail(err, 'Could not save the request');
    } finally {
      setBusy(false);
    }
  };

  if (loading && units.length === 0 && !error) return <PageLoading label="Loading blood bank…" />;
  if (error && units.length === 0) return <PageError error={error} onRetry={load} />;

  const soon = addDays(7);
  const available = units.filter((u) => u.status === 'available' && u.expiresAt >= today);

  return (
    <>
      <PageHeader title={t('clinical.bloodBank.title')} description={t('clinical.bloodBank.subtitle')} />
      {formError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {formError}
        </p>
      ) : null}

      <h2 className="mb-2 text-base font-semibold">{`Stock (${available.length} units available)`}</h2>
      {units.length === 0 ? (
        <EmptyState title="No units in stock" description="Receive a unit from your mother blood centre below." />
      ) : (
        <DataTable
          data={units}
          getRowId={(row) => row.id}
          pageSize={10}
          emptyMessage="No units"
          columns={[
            { id: 'unit', header: 'Unit no.', accessor: (row) => row.unitNo },
            { id: 'component', header: 'Component', accessor: (row) => COMPONENT_LABEL[row.component] },
            { id: 'group', header: 'Group', accessor: (row) => group(row.abo, row.rh) },
            { id: 'volume', header: 'Volume (ml)', accessor: (row) => row.volumeMl },
            { id: 'expiry', header: 'Expires', accessor: (row) => row.expiresAt, render: (row) => formatDate(row.expiresAt) },
            { id: 'tti', header: 'TTI', accessor: (row) => (row.ttiCleared ? 'Cleared' : 'Not cleared') },
            {
              id: 'status',
              header: 'Status',
              accessor: (row) => row.status,
              render: (row) =>
                row.expiresAt < today && row.status === 'available' ? (
                  <Badge tone="error">Expired</Badge>
                ) : row.status === 'available' && row.expiresAt <= soon ? (
                  <Badge tone="warning">Expires soon</Badge>
                ) : (
                  <Badge tone={row.status === 'available' ? 'success' : 'neutral'}>{row.status}</Badge>
                ),
            },
          ]}
        />
      )}

      <h2 className="mb-2 mt-8 text-base font-semibold">Receive a unit</h2>
      <form
        className="mb-6 grid max-w-3xl gap-3 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          void receive();
        }}
      >
        <Field label="Unit number" required>
          <Input value={unitNo} onChange={(event) => setUnitNo(event.target.value)} required minLength={3} />
        </Field>
        <Field label="Component" required>
          <Select aria-label="Component" value={component} onChange={(event) => setComponent(event.target.value as BbComponent)}>
            {COMPONENTS.map((c) => (
              <option key={c} value={c}>
                {COMPONENT_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Volume (ml)" required>
          <Input type="number" min={1} max={1000} value={volumeMl} onChange={(event) => setVolumeMl(event.target.value)} required />
        </Field>
        <Field label="ABO group" required>
          <Select aria-label="ABO group" value={abo} onChange={(event) => setAbo(event.target.value as BbAbo)}>
            {ABO.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </Field>
        <Field label="Rh" required>
          <Select aria-label="Rh" value={rh} onChange={(event) => setRh(event.target.value as BbRh)}>
            <option value="pos">Positive</option>
            <option value="neg">Negative</option>
          </Select>
        </Field>
        <Field label="TTI tested and cleared by source centre" required>
          <Select aria-label="TTI cleared" value={ttiCleared} onChange={(event) => setTtiCleared(event.target.value)}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <Field label="Collected on" required>
          <Input type="date" value={collectedOn} onChange={(event) => setCollectedOn(event.target.value)} required />
        </Field>
        <Field label="Expires on" required>
          <Input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required />
        </Field>
        <Field label="Source blood centre">
          <Input value={sourceCentre} onChange={(event) => setSourceCentre(event.target.value)} />
        </Field>
        <div>
          <Button type="submit" loading={busy}>
            Receive unit
          </Button>
        </div>
      </form>

      <h2 className="mb-2 mt-8 text-base font-semibold">Requests</h2>
      {requests.length === 0 ? (
        <EmptyState title="No blood requests" />
      ) : (
        <DataTable
          data={requests}
          getRowId={(row) => row.id}
          pageSize={10}
          emptyMessage="No requests"
          columns={[
            { id: 'uhid', header: 'UHID', accessor: (row) => row.uhid },
            { id: 'patient', header: 'Patient', accessor: (row) => row.patientName },
            { id: 'group', header: 'Patient group', accessor: (row) => group(row.patientAbo, row.patientRh) },
            { id: 'component', header: 'Component', accessor: (row) => COMPONENT_LABEL[row.component] },
            { id: 'urgency', header: 'Urgency', accessor: (row) => row.urgency },
            {
              id: 'status',
              header: 'Status',
              accessor: (row) => row.status,
              render: (row) => <Badge tone={row.status === 'issued' ? 'success' : 'info'}>{row.status}</Badge>,
            },
            {
              id: 'open',
              header: '',
              accessor: () => '',
              render: (row) => (
                <Link href={`/app/blood-bank/requests/${row.id}`} className="hos-link">
                  {row.status === 'open' ? 'Issue' : 'View'}
                </Link>
              ),
            },
          ]}
        />
      )}

      <h2 className="mb-2 mt-8 text-base font-semibold">New blood request</h2>
      <form
        className="mb-6 grid max-w-3xl gap-3 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          void createRequest();
        }}
      >
        <div className="md:col-span-3">
          <Field label="Patient" required>
            <PatientPicker onValueChange={setPatient} />
          </Field>
          {patient ? <p className="mt-1 text-sm">{`${patient.fullName} · ${patient.uhid}`}</p> : null}
        </div>
        <Field label="Component" required>
          <Select aria-label="Requested component" value={reqComponent} onChange={(event) => setReqComponent(event.target.value as BbComponent)}>
            {COMPONENTS.map((c) => (
              <option key={c} value={c}>
                {COMPONENT_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Patient ABO group" required>
          <Select aria-label="Patient ABO group" value={pAbo} onChange={(event) => setPAbo(event.target.value as BbAbo)}>
            {ABO.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </Field>
        <Field label="Patient Rh" required>
          <Select aria-label="Patient Rh" value={pRh} onChange={(event) => setPRh(event.target.value as BbRh)}>
            <option value="pos">Positive</option>
            <option value="neg">Negative</option>
          </Select>
        </Field>
        <Field label="Urgency">
          <Select aria-label="Urgency" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="emergency">Emergency</option>
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Indication">
            <Input value={indication} onChange={(event) => setIndication(event.target.value)} maxLength={300} />
          </Field>
        </div>
        <div>
          <Button type="submit" loading={busy}>
            Save request
          </Button>
        </div>
      </form>
    </>
  );
}
