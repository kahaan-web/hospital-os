'use client';

import type { LabParamDto, LabTestDto, ServiceDto } from '@hos/shared';
import { SPECIMENS } from '@hos/shared';
import { Button, DataTable, Field, Input, PageHeader, Select } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { LabNav } from '@/features/clinical/lab/LabNav';
import { labApi } from '@/features/clinical/lab/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

export default function LabTestsPage() {
  const [tests, setTests] = useState<LabTestDto[]>([]);
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [params, setParams] = useState<LabParamDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [specimen, setSpecimen] = useState<string>('blood');
  const [container, setContainer] = useState('EDTA');
  const [tatHours, setTatHours] = useState('4');
  const [serviceId, setServiceId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [criticalLow, setCriticalLow] = useState('');
  const [criticalHigh, setCriticalHigh] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([labApi.tests(), labApi.labServices()])
      .then(([nextTests, nextServices]) => {
        setTests(nextTests);
        setServices(nextServices.filter((service) => service.active));
        setServiceId((current) => current || nextServices.find((service) => service.active)?.id || '');
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setParams([]);
      return;
    }
    labApi.params(selected).then(setParams).catch((err: unknown) => setFormError(err instanceof ApiError ? err.message : 'Could not load parameters'));
  }, [selected]);

  const addTest = async () => {
    setBusy(true);
    setFormError('');
    try {
      const created = await labApi.createTest({
        serviceId,
        specimen: specimen as (typeof SPECIMENS)[number],
        container: container.trim(),
        tatHours: Number(tatHours),
      });
      setTests((current) => [...current, created].sort((a, b) => a.serviceName.localeCompare(b.serviceName, 'en-IN')));
      setSelected(created.id);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the template');
    } finally {
      setBusy(false);
    }
  };

  const addParam = async () => {
    if (!selected) return;
    setBusy(true);
    setFormError('');
    try {
      const created = await labApi.createParam(selected, {
        code: code.trim(),
        name: name.trim(),
        unit: unit.trim(),
        valueType: 'numeric',
        decimals: unit.toLowerCase().includes('mg') ? 0 : 1,
        refRanges: [
          {
            sex: 'any',
            ageMinYears: 0,
            ageMaxYears: null,
            low: low.trim() ? Number(low) : null,
            high: high.trim() ? Number(high) : null,
          },
        ],
        criticalLow: criticalLow.trim() ? Number(criticalLow) : null,
        criticalHigh: criticalHigh.trim() ? Number(criticalHigh) : null,
      });
      setParams((current) => [...current, created]);
      setCode('');
      setName('');
      setUnit('');
      setLow('');
      setHigh('');
      setCriticalLow('');
      setCriticalHigh('');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the parameter');
    } finally {
      setBusy(false);
    }
  };

  if (loading && tests.length === 0 && !error) return <PageLoading label="Loading test master…" />;
  if (error) return <PageError error={error} onRetry={load} />;

  const taken = new Set(tests.map((test) => test.serviceId));

  return (
    <>
      <PageHeader
        title="Test master"
        description="Templates, specimens and reference ranges. Diagnostic services are usually exempt (SAC 9993). Confirm rates with your CA."
      />
      <LabNav />
      {formError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {formError}
        </p>
      ) : null}
      <form
        className="mb-6 grid max-w-3xl gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void addTest();
        }}
      >
        <Field label="Service" required>
          <Select aria-label="Service" value={serviceId} onChange={(event) => setServiceId(event.target.value)} required>
            <option value="">Select a lab service</option>
            {services.map((service) => (
              <option key={service.id} value={service.id} disabled={taken.has(service.id)}>
                {service.code} · {service.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Specimen" required>
          <Select aria-label="Specimen" value={specimen} onChange={(event) => setSpecimen(event.target.value)}>
            {SPECIMENS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Container" required>
          <Input value={container} onChange={(event) => setContainer(event.target.value)} required />
        </Field>
        <Field label="Turnaround (hours)" required>
          <Input inputMode="numeric" value={tatHours} onChange={(event) => setTatHours(event.target.value)} required />
        </Field>
        <div>
          <Button type="submit" disabled={busy || !serviceId}>
            Add template
          </Button>
        </div>
      </form>
      <DataTable
        data={tests}
        getRowId={(row) => row.id}
        emptyMessage="No templates yet. Add one for each lab service you order."
        columns={[
          { id: 'code', header: 'Code', accessor: (row) => row.serviceCode },
          { id: 'name', header: 'Test', accessor: (row) => row.serviceName },
          { id: 'specimen', header: 'Specimen', accessor: (row) => row.specimen },
          { id: 'container', header: 'Container', accessor: (row) => row.container },
          { id: 'tat', header: 'TAT (h)', accessor: (row) => row.tatHours },
          {
            id: 'open',
            header: '',
            accessor: () => '',
            render: (row) => (
              <Button type="button" variant={selected === row.id ? 'primary' : 'secondary'} onClick={() => setSelected(row.id)}>
                Parameters
              </Button>
            ),
          },
        ]}
      />
      {selected ? (
        <section className="mt-8 max-w-3xl" aria-label="Parameters">
          <h2 className="mb-3 text-lg font-semibold">Parameters</h2>
          <DataTable
            data={params}
            getRowId={(row) => row.id}
            emptyMessage="No parameters on this template."
            columns={[
              { id: 'code', header: 'Code', accessor: (row) => row.code },
              { id: 'name', header: 'Name', accessor: (row) => row.name },
              { id: 'unit', header: 'Unit', accessor: (row) => row.unit || '—' },
              {
                id: 'critical',
                header: 'Critical',
                accessor: (row) =>
                  row.criticalLow == null && row.criticalHigh == null ? '—' : `${row.criticalLow ?? '—'} to ${row.criticalHigh ?? '—'}`,
              },
            ]}
          />
          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addParam();
            }}
          >
            <Field label="Code" required>
              <Input value={code} onChange={(event) => setCode(event.target.value)} required maxLength={20} />
            </Field>
            <Field label="Name" required>
              <Input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Unit">
              <Input value={unit} onChange={(event) => setUnit(event.target.value)} />
            </Field>
            <Field label="Reference low">
              <Input inputMode="decimal" value={low} onChange={(event) => setLow(event.target.value)} />
            </Field>
            <Field label="Reference high">
              <Input inputMode="decimal" value={high} onChange={(event) => setHigh(event.target.value)} />
            </Field>
            <Field label="Critical low" hint="Shown in danger colour with the label Critical low.">
              <Input inputMode="decimal" value={criticalLow} onChange={(event) => setCriticalLow(event.target.value)} />
            </Field>
            <Field label="Critical high">
              <Input inputMode="decimal" value={criticalHigh} onChange={(event) => setCriticalHigh(event.target.value)} />
            </Field>
            <div>
              <Button type="submit" disabled={busy}>
                Add parameter
              </Button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
