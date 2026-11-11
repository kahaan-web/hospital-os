'use client';

import type { PrescriptionInput } from '@hos/shared';
import { FREQUENCIES, ROUTES } from '@hos/shared';
import { Button, Input, Select } from '@hos/ui';
import { useState } from 'react';

export interface RxLine {
  drugName: string;
  genericCode: string;
  strength: string;
  frequencyCode: string;
  routeCode: string;
  durationDays: string;
  instructions: string;
}

const emptyLine = (): RxLine => ({
  drugName: '',
  genericCode: '',
  strength: '',
  frequencyCode: 'TDS',
  routeCode: 'oral',
  durationDays: '5',
  instructions: '',
});

export function PrescriptionEditor({
  onSubmit,
  busy,
}: {
  onSubmit: (body: PrescriptionInput) => Promise<void>;
  busy?: boolean;
}) {
  const [lines, setLines] = useState<RxLine[]>([emptyLine()]);
  const [overrideReason, setOverrideReason] = useState('');

  const update = (index: number, patch: Partial<RxLine>) => {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = lines
      .filter((l) => l.drugName.trim())
      .map((l) => ({
        drugName: l.drugName.trim(),
        genericCode: l.genericCode.trim() || l.drugName.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 40),
        strength: l.strength || undefined,
        frequencyCode: l.frequencyCode as PrescriptionInput['items'][0]['frequencyCode'],
        routeCode: l.routeCode as PrescriptionInput['items'][0]['routeCode'],
        durationDays: l.durationDays ? Number(l.durationDays) : undefined,
        instructions: l.instructions || undefined,
      }));
    if (!items.length) return;
    await onSubmit({
      items,
      overrideReason: overrideReason.trim() || undefined,
    });
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      {lines.map((line, index) => (
        <div className="grid gap-2 rounded-lg border border-[var(--hos-border)] p-3 md:grid-cols-6" key={index}>
          <Input
            value={line.drugName}
            onChange={(e) => update(index, { drugName: e.target.value })}
            placeholder="Medicine"
            aria-label={`Medicine ${index + 1}`}
            className="md:col-span-2"
          />
          <Input
            value={line.genericCode}
            onChange={(e) => update(index, { genericCode: e.target.value })}
            placeholder="Generic code"
            aria-label={`Generic ${index + 1}`}
          />
          <Input
            value={line.strength}
            onChange={(e) => update(index, { strength: e.target.value })}
            placeholder="Strength"
            aria-label={`Strength ${index + 1}`}
          />
          <Select
            value={line.frequencyCode}
            onChange={(e) => update(index, { frequencyCode: e.target.value })}
            aria-label={`Frequency ${index + 1}`}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.code} value={f.code}>
                {f.label}
              </option>
            ))}
          </Select>
          <Select value={line.routeCode} onChange={(e) => update(index, { routeCode: e.target.value })} aria-label={`Route ${index + 1}`}>
            {ROUTES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Input
            value={line.durationDays}
            onChange={(e) => update(index, { durationDays: e.target.value })}
            placeholder="Days"
            aria-label={`Days ${index + 1}`}
            type="number"
            min={1}
          />
          <Input
            value={line.instructions}
            onChange={(e) => update(index, { instructions: e.target.value })}
            placeholder="Instructions"
            aria-label={`Instructions ${index + 1}`}
            className="md:col-span-6"
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={addLine}>
          Add line
        </Button>
      </div>
      <Input
        value={overrideReason}
        onChange={(e) => setOverrideReason(e.target.value)}
        placeholder="Allergy override reason (if needed)"
        aria-label="Allergy override reason"
      />
      <Button type="submit" disabled={busy}>
        Save prescription
      </Button>
    </form>
  );
}
