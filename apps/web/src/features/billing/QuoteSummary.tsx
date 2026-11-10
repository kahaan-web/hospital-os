'use client';

import type { Catalog, QuoteDto, TaxTotals } from '@hos/shared';
import { applyGst, priceSubscription, type PriceBook, type SubscriptionConfig } from '@hos/shared';
import { PriceDisplay } from '@hos/ui';
import { useMemo } from 'react';
import { formatINR } from '@/lib/format';

const FALLBACK_SUPPLIER_STATE = '27';
const FALLBACK_PLAN_GST_BP = 1800;
const FALLBACK_PLAN_SAC = '998314';

export function catalogToPriceBook(catalog: Catalog): PriceBook {
  const billing = catalog.billing;
  return {
    plans: catalog.plans.map((p) => ({
      id: p.id,
      name: p.name,
      monthlyPaise: p.monthlyPaise,
      annualPaise: p.annualPaise,
    })),
    addons: catalog.modules
      .filter((m) => m.addonPurchasable && m.addonMonthlyPaise != null)
      .map((m) => ({
        moduleId: m.id,
        name: m.name,
        monthlyPaise: m.addonMonthlyPaise ?? 0,
        annualPaise: m.addonAnnualPaise ?? 0,
        gstRateBp: m.gstRateBp,
        sacCode: m.sacCode,
      })),
    planGstRateBp: billing?.planGstRateBp ?? FALLBACK_PLAN_GST_BP,
    planSacCode: billing?.planSacCode ?? FALLBACK_PLAN_SAC,
  };
}

export function clientQuotePreview(
  catalog: Catalog,
  cfg: SubscriptionConfig,
  placeOfSupplyStateCode: string,
  supplierStateCode?: string,
): { lines: QuoteDto['lines']; totals: TaxTotals } {
  const book = catalogToPriceBook(catalog);
  const lines = priceSubscription(book, cfg);
  const supplier = supplierStateCode ?? catalog.billing?.supplierStateCode ?? FALLBACK_SUPPLIER_STATE;
  return applyGst(lines, supplier, placeOfSupplyStateCode);
}

export function QuoteSummary({ totals, label = 'Estimated total' }: { totals: TaxTotals; label?: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--hos-border)',
        padding: 'var(--hos-space-4)',
        background: 'var(--hos-bg-surface)',
      }}
    >
      <div style={{ fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)', marginBottom: 'var(--hos-space-2)' }}>
        {label}
        {totals.interState ? ' · IGST' : ' · CGST + SGST'}
      </div>
      <PriceDisplay paise={totals.totalPaise} className="hos-text-lg" />
      <dl
        style={{
          margin: 'var(--hos-space-3) 0 0',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 'var(--hos-space-1) var(--hos-space-4)',
          fontSize: 'var(--hos-text-sm)',
        }}
      >
        <dt style={{ color: 'var(--hos-fg-muted)' }}>Taxable</dt>
        <dd style={{ margin: 0 }}>{formatINR(totals.taxablePaise)}</dd>
        {totals.interState ? (
          <>
            <dt style={{ color: 'var(--hos-fg-muted)' }}>IGST</dt>
            <dd style={{ margin: 0 }}>{formatINR(totals.igstPaise)}</dd>
          </>
        ) : (
          <>
            <dt style={{ color: 'var(--hos-fg-muted)' }}>CGST</dt>
            <dd style={{ margin: 0 }}>{formatINR(totals.cgstPaise)}</dd>
            <dt style={{ color: 'var(--hos-fg-muted)' }}>SGST</dt>
            <dd style={{ margin: 0 }}>{formatINR(totals.sgstPaise)}</dd>
          </>
        )}
      </dl>
      <p style={{ margin: 'var(--hos-space-3) 0 0', fontSize: 'var(--hos-text-xs)', color: 'var(--hos-fg-muted)' }}>
        Sample price — final amount comes from the server quote at checkout.
      </p>
    </div>
  );
}

export function useClientQuote(
  catalog: Catalog | null,
  cfg: SubscriptionConfig | null,
  stateCode: string | null,
  supplierStateCode?: string,
) {
  return useMemo(() => {
    if (!catalog || !cfg || !stateCode) return null;
    try {
      return clientQuotePreview(catalog, cfg, stateCode, supplierStateCode);
    } catch {
      return null;
    }
  }, [catalog, cfg, stateCode, supplierStateCode]);
}
