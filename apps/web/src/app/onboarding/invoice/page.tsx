'use client';

import type { InvoiceDto, OnboardingState } from '@hos/shared';
import { Button, PageHeader, PrintLayout, useToast } from '@hos/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { OnboardingWizardShell } from '@/features/onboarding/OnboardingWizardShell';
import { formatDate, formatINR } from '@/lib/format';
import { API_BASE, apiGet, apiText } from '@/lib/api';

export default function InvoicePage() {
  return (
    <OnboardingWizardShell currentHref="/onboarding/invoice">
      <OnboardingGate allowedHrefs={['/onboarding/invoice', '/onboarding/checkout']}>
        {(state) => <InvoiceBody state={state} />}
      </OnboardingGate>
    </OnboardingWizardShell>
  );
}

function InvoiceBody({ state }: { state: OnboardingState }) {
  const router = useRouter();
  const toast = useToast();
  const [invoice, setInvoice] = useState<InvoiceDto | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const id = state.invoiceId;

  const load = useCallback(async (invoiceId: string) => {
    try {
      const inv = await apiGet<InvoiceDto>(`/billing/invoices/${invoiceId}`);
      setInvoice(inv);
      const printable = await apiText(`/billing/invoices/${invoiceId}/html`);
      setHtml(printable);
    } catch {
      toast.toast({ tone: 'error', title: 'Invoice not ready yet' });
    }
  }, [toast]);

  useEffect(() => {
    if (id) load(id);
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
            <PrintLayout title={`Invoice ${invoice.number}`}>
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </PrintLayout>
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
