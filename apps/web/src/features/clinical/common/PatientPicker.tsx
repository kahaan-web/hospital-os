'use client';

import type { PatientSummaryDto } from '@hos/shared';
import { Input } from '@hos/ui';
import { useEffect, useId, useState } from 'react';
import { clinicalApi } from './clinicalApi';

export function PatientPicker({
  onValueChange,
  disabled,
}: {
  onValueChange: (patient: PatientSummaryDto) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<PatientSummaryDto[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRows([]);
      return;
    }
    const handle = setTimeout(() => {
      clinicalApi
        .searchPatients(q.trim())
        .then((page) => setRows(page.items))
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [q]);

  return (
    <div>
      <Input
        value={q}
        disabled={disabled}
        aria-label="Search patients"
        aria-controls={listId}
        placeholder="Name, UHID or mobile"
        onChange={(event) => setQ(event.target.value)}
      />
      <ul id={listId} role="listbox" aria-label="Matching patients" style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
        {rows.map((patient) => (
          <li key={patient.id}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                onValueChange(patient);
                setQ(patient.fullName);
                setRows([]);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                background: 'transparent',
                border: 0,
                color: 'var(--hos-fg-primary)',
              }}
            >
              {patient.fullName} · {patient.uhid} · {patient.ageLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
