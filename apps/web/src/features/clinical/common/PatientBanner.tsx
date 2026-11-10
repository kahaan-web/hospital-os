'use client';

import type { PatientAlertDto, PatientSummaryDto } from '@hos/shared';

export function PatientBanner({ patient, alerts }: { patient: PatientSummaryDto; alerts: PatientAlertDto[] }) {
  const active = alerts.filter((alert) => !alert.inactiveAt);
  return (
    <section aria-label="Patient" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'baseline' }}>
      <strong>{patient.fullName}</strong>
      <span>{patient.uhid}</span>
      <span>
        {patient.ageLabel} · {patient.gender}
      </span>
      <span>{patient.city}</span>
      {active.map((alert) => (
        <p
          key={alert.id}
          style={{
            margin: 0,
            padding: '2px 8px',
            background: 'var(--hos-status-error-bg)',
            color: 'var(--hos-status-error-fg)',
            border: '1px solid var(--hos-status-error-border)',
          }}
        >
          <span>Alert</span> {alert.text}
        </p>
      ))}
    </section>
  );
}
