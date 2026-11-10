'use client';

import type { InvoiceDto, OnboardingState } from '@hos/shared';
import { Button, PageHeader, useToast } from '@hos/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { OnboardingWizardShell } from '@/features/onboarding/OnboardingWizardShell';
import { formatDate, formatINR } from '@/lib/format';
import { API_BASE, apiGet, apiText } from '@/lib/api';

export default function InvoicePage() {
  return (
    <OnboardingWizardShell currentHref="/onboarding/invoice">
      <OnboardingGate allowedHrefs={['/onboarding/invoice', '/onboarding/checkout']} currentHref="/onboarding/invoice">
        {(state) => <InvoiceBody state={state} />}
      </OnboardingGate>
    </OnboardingWizardShell>
  );
}

function InvoiceBody({ state }: { state: OnboardingState }) {
  const router = useRouter();
  const { toast: showToast } = useToast();
  const [invoice, setInvoice] = useState<InvoiceDto | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const id = state.invoiceId;
  const toastErrorRef = useRef(false);

  const load = useCallback(
    async (invoiceId: string) => {
      try {
        const inv = await apiGet<InvoiceDto>(`/billing/invoices/${invoiceId}`);
        setInvoice(inv);
        const printable = await apiText(`/billing/invoices/${invoiceId}/html`);
        setHtml(printable);
        toastErrorRef.current = false;
      } catch {
        if (!toastErrorRef.current) {
          toastErrorRef.current = true;
          showToast({ tone: 'error', title: 'Invoice not ready yet' });
        }
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (id) void load(id);
  }, [id, load]);

  return (
    <>
      <PageHeader
        title="GST tax invoice"
        description="Download PDF or print this HTML invoice. Supplier details use platform placeholders."
      />
      {invoice ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-4)' }}>
          <p style={{ margin: 0 }}>
            <strong>{invoice.number}</strong> · {formatDate(invoice.issueDate)} · {formatINR(invoice.totalPaise)}
          </p>
          <div style={{ display: 'flex', gap: 'var(--hos-space-3)', flexWrap: 'wrap' }}>
            <Button asChild>
              <a href={`${API_BASE}/billing/invoices/${invoice.id}/pdf`} download>
                Download PDF
              </a>
            </Button>
            <Button variant="secondary" type="button" onClick={() => window.print()}>
              Print
            </Button>
            <Button type="button" onClick={() => router.push('/onboarding/provisioning')}>
              Continue to provisioning
            </Button>
          </div>
          {html ? (
            <iframe
              title={`Invoice ${invoice.number}`}
              srcDoc={html}
              sandbox=""
              style={{
                width: '100%',
                minHeight: '28rem',
                border: '1px solid var(--hos-border)',
                background: '#fff',
              }}
            />
          ) : null}
        </div>
      ) : (
        <p>
          Complete payment first. <Link href="/onboarding/checkout">Back to checkout</Link>
        </p>
      )}
    </>
  );
}
