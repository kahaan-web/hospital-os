'use client';

import { Button } from '@hos/ui';
import { useState } from 'react';
import { CasesPanel } from '@/features/clinical/ot/CasesPanel';
import { OtSubNav } from '@/features/clinical/ot/OtSubNav';
import { RequestDashboard } from '@/features/clinical/ot/RequestDashboard';

export default function OtPage() {
  const [tab, setTab] = useState<'requests' | 'cases'>('requests');
  return (
    <>
      <style>{`
        @media print {
          .ot-no-print { display: none !important; }
        }
      `}</style>
      <OtSubNav />
      <div className="ot-no-print" role="tablist" aria-label="OT views" style={{ display: 'flex', gap: 'var(--hos-space-2)', marginBottom: 'var(--hos-space-4)' }}>
        <Button type="button" role="tab" aria-selected={tab === 'requests'} variant={tab === 'requests' ? 'primary' : 'secondary'} onClick={() => setTab('requests')}>
          Requests
        </Button>
        <Button type="button" role="tab" aria-selected={tab === 'cases'} variant={tab === 'cases' ? 'primary' : 'secondary'} onClick={() => setTab('cases')}>
          Cases
        </Button>
      </div>
      {tab === 'requests' ? <RequestDashboard /> : <CasesPanel />}
    </>
  );
}
