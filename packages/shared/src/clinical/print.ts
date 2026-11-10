export interface LetterheadDto {
  name: string;
  address: string;
  gstin: string;
  registrationNo: string;
  logoPath: string | null;
  phone: string;
}

export type PrintBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'keyValues'; rows: { label: string; value: string }[] }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'paragraph'; text: string }
  | { kind: 'totals'; rows: { label: string; value: string }[] }
  | { kind: 'amountInWords'; text: string }
  | { kind: 'barcode'; value: string }
  | { kind: 'signature'; label: string }
  | { kind: 'spacer'; mm?: number };

export interface PrintDoc {
  size: 'A4' | 'A5' | 'label_50x25';
  letterhead: LetterheadDto;
  blocks: PrintBlock[];
}
