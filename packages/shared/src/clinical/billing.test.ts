import { describe, expect, it } from 'vitest';
import { composeBill } from './billing';

describe('composeBill', () => {
  it('writes a bill of supply with zero tax when every line is exempt', () => {
    const bill = composeBill({
      lines: [
        { netPaise: 50_000, treatment: 'exempt_healthcare', configuredRateBp: 0, unitPricePaise: 50_000 },
        { netPaise: 30_000, treatment: 'exempt_healthcare', configuredRateBp: 0, unitPricePaise: 30_000 },
      ],
      billDiscountPaise: 0,
      interState: false,
      patientRegistered: false,
    });
    expect(bill.docType).toBe('bill_of_supply');
    expect(bill.cgstPaise + bill.sgstPaise + bill.igstPaise).toBe(0);
    expect(bill.totalPaise).toBe(80_000);
    expect(Math.abs(bill.roundOffPaise)).toBeLessThanOrEqual(50);
    const lineSum = bill.lines.reduce((sum, line) => sum + line.taxablePaise + line.cgstPaise + line.sgstPaise + line.igstPaise, 0);
    expect(lineSum + bill.roundOffPaise).toBe(bill.totalPaise);
  });

  it('writes an invoice-cum-bill of supply for a mixed unregistered bill and keeps paise exact', () => {
    const bill = composeBill({
      lines: [
        { netPaise: 50_000, treatment: 'exempt_healthcare', configuredRateBp: 0, unitPricePaise: 50_000 },
        { netPaise: 15_001, treatment: 'taxable', configuredRateBp: 500, unitPricePaise: 15_001 },
      ],
      billDiscountPaise: 0,
      interState: false,
      patientRegistered: false,
    });
    expect(bill.docType).toBe('invoice_cum_bill_of_supply');
    expect(bill.igstPaise).toBe(0);
    expect(bill.cgstPaise + bill.sgstPaise).toBe(750);
    const lineSum = bill.lines.reduce((sum, line) => sum + line.taxablePaise + line.cgstPaise + line.sgstPaise + line.igstPaise, 0);
    expect(lineSum + bill.roundOffPaise).toBe(bill.totalPaise);
    expect(Math.abs(bill.roundOffPaise)).toBeLessThanOrEqual(50);
    expect(bill.subtotalPaise - bill.discountPaise + bill.cgstPaise + bill.sgstPaise + bill.igstPaise + bill.roundOffPaise).toBe(bill.totalPaise);
  });

  it('zeroes tax when an approved concession covers the full amount', () => {
    const bill = composeBill({
      lines: [{ netPaise: 50_000, treatment: 'exempt_healthcare', configuredRateBp: 0, unitPricePaise: 50_000 }],
      billDiscountPaise: 50_000,
      interState: false,
      patientRegistered: false,
    });
    expect(bill.totalPaise).toBe(0);
    expect(bill.roundOffPaise).toBe(0);
    expect(bill.lines[0]?.taxablePaise).toBe(0);
  });
});
