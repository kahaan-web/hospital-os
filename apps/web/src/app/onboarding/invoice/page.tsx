'use client';

import type { InvoiceDto, OnboardingState } from '@hos/shared';
import { Button, PageHeader, useToast } from '@hos/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { OnboardingWizardShell } from '@/features/onboarding/OnboardingWizardShell';
import { wt } from '@/i18n';
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

  const printHtmlInvoice = useCallback(() => {
    if (!id) return;
    const url = `${API_BASE}/billing/invoices/${id}/html`;
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      showToast({ tone: 'error', title: wt('invoice.notReadyToast') });
      return;
    }
    const trigger = () => {
      win.focus();
      win.print();
    };
    if (win.document.readyState === 'complete') {
      trigger();
    } else {
      win.addEventListener('load', trigger, { once: true });
    }
  }, [id, showToast]);

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
          showToast({ tone: 'error', title: wt('invoice.notReadyToast') });
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
      <PageHeader title={wt('invoice.title')} description={wt('invoice.description')} />
      {invoice ? (
        <div className="hos-invoice-print-area" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-4)' }}>
          <p className="hos-invoice-meta" style={{ margin: 0 }}>
            <strong>{invoice.number}</strong> · {formatDate(invoice.issueDate)} · {formatINR(invoice.totalPaise)}
          </p>
          <div className="hos-invoice-actions no-print" style={{ display: 'flex', gap: 'var(--hos-space-3)', flexWrap: 'wrap' }}>
            <Button asChild>
              <a href={`${API_BASE}/billing/invoices/${invoice.id}/pdf`} download>
                {wt('invoice.downloadPdf')}
              </a>
            </Button>
            <Button variant="secondary" type="button" onClick={printHtmlInvoice}>
              {wt('invoice.print')}
            </Button>
            <Button type="button" onClick={() => router.push('/onboarding/provisioning')}>
              {wt('invoice.continueProvisioning')}
            </Button>
          </div>
          {html ? (
            <iframe
              className="hos-invoice-iframe"
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
          {wt('invoice.notReady')}{' '}
          <Link href="/onboarding/checkout">{wt('invoice.backCheckout')}</Link>
        </p>
      )}
    </>
  );
}
