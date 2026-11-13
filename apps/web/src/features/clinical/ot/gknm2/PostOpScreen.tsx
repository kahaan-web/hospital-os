'use client';

import { formatDate } from '@hos/shared';
import { Button, Field, Input, PageHeader, Select, Textarea } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ANAESTHESIA_TYPES,
  otGknm2Api,
  type PostOpDto,
  type PostOpInput,
  type SurgeryType,
} from '@/features/clinical/ot/api-gknm2';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';
import { OtSectionNav } from './OtSectionNav';
import { TimeTickRow } from './TimeTickRow';

const emptyForm = (): PostOpInput => ({
  preOpTime: '',
  wheelingInTime: '',
  anaesthesiaStartTime: '',
  surgeryStartTime: '',
  surgeryEndTime: '',
  anaesthesiaEndTime: '',
  wheelingOutTime: '',
  executedSurgery: '',
  executedSurgeryRemarks: '',
  perOpFindings: '',
  assistedDoctors: '',
  scrubNurse: '',
  floorNurse: '',
  adverseAnaesthesiaEvent: '',
  changeOfPlan: '',
  anaesthesiaType: '',
  surgeryType: '',
  complication: '',
  outcome: '',
  antibiotic: '',
});

function toInput(dto: PostOpDto): PostOpInput {
  const { booking: _b, ...rest } = dto;
  return {
    ...rest,
    preOpTime: rest.preOpTime ?? '',
    wheelingInTime: rest.wheelingInTime ?? '',
    anaesthesiaStartTime: rest.anaesthesiaStartTime ?? '',
    surgeryStartTime: rest.surgeryStartTime ?? '',
    surgeryEndTime: rest.surgeryEndTime ?? '',
    anaesthesiaEndTime: rest.anaesthesiaEndTime ?? '',
    wheelingOutTime: rest.wheelingOutTime ?? '',
  };
}

function timeOrNull(value: string): string | null {
  return value.trim() ? value : null;
}

export function PostOpScreen({ bookingId }: { bookingId: string }) {
  const [booking, setBooking] = useState<PostOpDto['booking'] | null>(null);
  const [form, setForm] = useState<PostOpInput>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    otGknm2Api
      .getPostOp(bookingId)
      .then((dto) => {
        setBooking(dto.booking);
        const next = toInput(dto);
        if (!next.executedSurgery.trim() && dto.booking.bookedSurgery) {
          next.executedSurgery = dto.booking.bookedSurgery;
        }
        setForm(next);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          setBooking({
            id: bookingId,
            appointmentNo: '—',
            patientNo: '—',
            patientName: '—',
            ipNo: null,
            surgeryDate: new Date().toISOString(),
            bookedSurgery: '',
            theatre: '—',
            surgeonName: '—',
          });
          setForm(emptyForm());
        } else {
          setError(err);
        }
      })
      .finally(() => setLoading(false));
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (partial: Partial<PostOpInput>) => setForm((prev) => ({ ...prev, ...partial }));

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const body: PostOpInput = {
        ...form,
        preOpTime: timeOrNull(form.preOpTime ?? ''),
        wheelingInTime: timeOrNull(form.wheelingInTime ?? ''),
        anaesthesiaStartTime: timeOrNull(form.anaesthesiaStartTime ?? ''),
        surgeryStartTime: timeOrNull(form.surgeryStartTime ?? ''),
        surgeryEndTime: timeOrNull(form.surgeryEndTime ?? ''),
        anaesthesiaEndTime: timeOrNull(form.anaesthesiaEndTime ?? ''),
        wheelingOutTime: timeOrNull(form.wheelingOutTime ?? ''),
      };
      const saved = await otGknm2Api.savePostOp(bookingId, body);
      setBooking(saved.booking);
      setForm(toInput(saved));
      setMessage('Post-operative details saved.');
      setNotFound(false);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not save post-operative details.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !booking) return <PageLoading label="Loading post-operative form…" />;
  if (error) return <PageError error={error} onRetry={load} />;

  const summary = booking!;

  return (
    <>
      <OtSectionNav />
      <PageHeader
        title="Post operative surgery details"
        description="Record theatre times and outcomes for this booking."
        actions={
          <Link href="/app/ot" className="hos-btn hos-btn--md hos-btn--secondary">
            Back to OT
          </Link>
        }
      />
      {notFound ? (
        <p role="status" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-muted)' }}>
          Booking details are not available yet from the server. You can still enter post-operative data and save when the API is ready.
        </p>
      ) : null}
      <section className="mb-6 max-w-3xl rounded border p-4" style={{ borderColor: 'var(--hos-line)', background: 'var(--hos-surface)' }}>
        <h2 className="mb-2 text-base font-semibold">Booking summary</h2>
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          <div>
            <dt style={{ color: 'var(--hos-fg-muted)' }}>Appt no</dt>
            <dd>{summary.appointmentNo}</dd>
          </div>
          <div>
            <dt style={{ color: 'var(--hos-fg-muted)' }}>Patient</dt>
            <dd>
              {summary.patientName} · {summary.patientNo}
              {summary.ipNo ? ` · IP ${summary.ipNo}` : ''}
            </dd>
          </div>
          <div>
            <dt style={{ color: 'var(--hos-fg-muted)' }}>Surgery date</dt>
            <dd>{formatDate(summary.surgeryDate)}</dd>
          </div>
          <div>
            <dt style={{ color: 'var(--hos-fg-muted)' }}>Theatre</dt>
            <dd>{summary.theatre}</dd>
          </div>
          <div>
            <dt style={{ color: 'var(--hos-fg-muted)' }}>Booked surgery</dt>
            <dd>{summary.bookedSurgery || '—'}</dd>
          </div>
          <div>
            <dt style={{ color: 'var(--hos-fg-muted)' }}>Surgeon</dt>
            <dd>{summary.surgeonName}</dd>
          </div>
        </dl>
      </section>

      {message ? (
        <p role="status" className="mb-3 text-sm">
          {message}
        </p>
      ) : null}

      <form
        className="flex max-w-3xl flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset className="flex flex-col gap-3 border-0 p-0">
          <legend className="mb-1 text-base font-semibold">Theatre times</legend>
          <TimeTickRow id="pre-op" label="Pre OP time" value={form.preOpTime ?? ''} onChange={(v) => patch({ preOpTime: v })} />
          <TimeTickRow id="wheel-in" label="Wheeling in time" value={form.wheelingInTime ?? ''} onChange={(v) => patch({ wheelingInTime: v })} />
          <TimeTickRow
            id="anes-start"
            label="Anaesthesia start time"
            value={form.anaesthesiaStartTime ?? ''}
            onChange={(v) => patch({ anaesthesiaStartTime: v })}
          />
          <TimeTickRow id="surg-start" label="Surgery start time" value={form.surgeryStartTime ?? ''} onChange={(v) => patch({ surgeryStartTime: v })} />
          <TimeTickRow id="surg-end" label="Surgery end time" value={form.surgeryEndTime ?? ''} onChange={(v) => patch({ surgeryEndTime: v })} />
          <TimeTickRow
            id="anes-end"
            label="Anaesthesia end time"
            value={form.anaesthesiaEndTime ?? ''}
            onChange={(v) => patch({ anaesthesiaEndTime: v })}
          />
          <TimeTickRow id="wheel-out" label="Wheeling out time" value={form.wheelingOutTime ?? ''} onChange={(v) => patch({ wheelingOutTime: v })} />
        </fieldset>

        <Field label="Executed surgery" hint="Prefilled from booked surgery; add remarks below.">
          <Input
            value={form.executedSurgery}
            onChange={(e) => patch({ executedSurgery: e.target.value })}
            aria-label="Executed surgery"
          />
        </Field>
        <Field label="Additional remarks (executed surgery)">
          <Textarea value={form.executedSurgeryRemarks} onChange={(e) => patch({ executedSurgeryRemarks: e.target.value })} rows={2} />
        </Field>
        <Field label="Per OP findings">
          <Textarea value={form.perOpFindings} onChange={(e) => patch({ perOpFindings: e.target.value })} rows={3} />
        </Field>
        <Field label="Assisted doctors">
          <Input value={form.assistedDoctors} onChange={(e) => patch({ assistedDoctors: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Scrub nurse">
            <Input value={form.scrubNurse} onChange={(e) => patch({ scrubNurse: e.target.value })} />
          </Field>
          <Field label="Floor nurse">
            <Input value={form.floorNurse} onChange={(e) => patch({ floorNurse: e.target.value })} />
          </Field>
        </div>
        <Field label="Adverse anaesthesia event">
          <Textarea value={form.adverseAnaesthesiaEvent} onChange={(e) => patch({ adverseAnaesthesiaEvent: e.target.value })} rows={2} />
        </Field>
        <Field label="Change of plan, if any">
          <Textarea value={form.changeOfPlan} onChange={(e) => patch({ changeOfPlan: e.target.value })} rows={2} />
        </Field>
        <Field label="Anaesthesia type">
          <Select
            value={form.anaesthesiaType}
            onChange={(e) => patch({ anaesthesiaType: e.target.value })}
            aria-label="Anaesthesia type"
          >
            <option value="">Select…</option>
            {ANAESTHESIA_TYPES.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type of surgery">
          <Select
            value={form.surgeryType}
            onChange={(e) => patch({ surgeryType: e.target.value as SurgeryType | '' })}
            aria-label="Type of surgery"
          >
            <option value="">Select…</option>
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </Select>
        </Field>
        <Field label="Complication">
          <Textarea value={form.complication} onChange={(e) => patch({ complication: e.target.value })} rows={2} />
        </Field>
        <Field label="Outcome">
          <Textarea value={form.outcome} onChange={(e) => patch({ outcome: e.target.value })} rows={2} />
        </Field>
        <Field label="Antibiotic">
          <Input value={form.antibiotic} onChange={(e) => patch({ antibiotic: e.target.value })} />
        </Field>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" disabled={saving}>
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setForm(emptyForm());
              setMessage('');
            }}
          >
            Clear
          </Button>
        </div>
      </form>
    </>
  );
}
