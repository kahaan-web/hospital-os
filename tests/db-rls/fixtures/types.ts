// Shared types for the RLS probe tenants. Sample data only: "(Sample)" names, DEMO- UHIDs,
// 00- ABHA numbers, @sbx mail, and 90000-block mobiles (shown to people as +91 90000 …).
import type pg from 'pg';

export interface ProbeSpec {
  slug: string;
  tag: string;
  legalName: string;
  displayName: string;
  userName: string;
  email: string;
  mobile: string;
  doctorName: string;
  contactName: string;
  contactMobile: string;
  /** Globally unique, at most 16 characters (invoices_number_len_chk). */
  invoiceNumber: string;
  patientTitle: string;
  patientFirst: string;
  patientLast: string;
  patientGender: 'male' | 'female' | 'other';
  patientDob: string;
  patientAge: number;
  patientMobile: string;
  patientEmergencyMobile: string;
  patientEmail: string;
  /** 14-digit sample ABHA. Real numbers never start with 00. */
  patientAbha: string;
  patientAbhaAddress: string;
  /** DEMO- UHID, unique per tenant. */
  uhid: string;
  encounterNumber: string;
  orderNumber: string;
  cashNumber: string;
}

export const TENANT_A: ProbeSpec = {
  slug: 'rls-alpha',
  tag: 'alpha',
  legalName: 'RLS Alpha Clinic (Sample)',
  displayName: 'RLS Alpha Clinic (Sample)',
  userName: 'Meera Kulkarni (Sample)',
  email: 'meera.kulkarni.rls@sbx',
  mobile: '9000011001',
  doctorName: 'Dr. Meera Kulkarni (Sample)',
  contactName: 'Arjun Kulkarni (Sample)',
  contactMobile: '9000011002',
  invoiceNumber: 'RLSA/2627/000001',
  patientTitle: 'Ms',
  patientFirst: 'Anita',
  patientLast: 'Deshmukh (Sample)',
  patientGender: 'female',
  patientDob: '1990-04-12',
  patientAge: 36,
  patientMobile: '9000011003',
  patientEmergencyMobile: '9000011004',
  patientEmail: 'anita.deshmukh.rls@sbx',
  patientAbha: '00-0000-0000-1101',
  patientAbhaAddress: 'anita.deshmukh.1101@sbx',
  uhid: 'DEMO-RLSA-00001',
  encounterNumber: 'RLSA-OV-00001',
  orderNumber: 'RLSA-OR-00001',
  cashNumber: 'RLSA-RC-00001',
};

export const TENANT_B: ProbeSpec = {
  slug: 'rls-beta',
  tag: 'beta',
  legalName: 'RLS Beta Clinic (Sample)',
  displayName: 'RLS Beta Clinic (Sample)',
  userName: 'Dev Sharma (Sample)',
  email: 'dev.sharma.rls@sbx',
  mobile: '9000012001',
  doctorName: 'Dr. Dev Sharma (Sample)',
  contactName: 'Nisha Sharma (Sample)',
  contactMobile: '9000012002',
  invoiceNumber: 'RLSB/2627/000001',
  patientTitle: 'Mr',
  patientFirst: 'Rohan',
  patientLast: 'Iyer (Sample)',
  patientGender: 'male',
  patientDob: '1988-11-02',
  patientAge: 37,
  patientMobile: '9000012003',
  patientEmergencyMobile: '9000012004',
  patientEmail: 'rohan.iyer.rls@sbx',
  patientAbha: '00-0000-0000-1201',
  patientAbhaAddress: 'rohan.iyer.1201@sbx',
  uhid: 'DEMO-RLSB-00001',
  encounterNumber: 'RLSB-OV-00001',
  orderNumber: 'RLSB-OR-00001',
  cashNumber: 'RLSB-RC-00001',
};

export interface TenantFixture {
  id: string;
  spec: ProbeSpec;
  userId: string;
  locationId: string;
  otpId: string;
  inviteToken: string;
  /** Unexpired, unrevoked session. Refreshed on every run so idle timeout does not rot the row. */
  sessionToken: string;
  expiredSessionToken: string;
  revokedSessionToken: string;
}

/** One Phase module's probe rows. Register it from `fixtures/index.ts`. */
export interface FixtureModule {
  name: string;
  seed: (owner: pg.Client, tenantId: string, spec: ProbeSpec) => Promise<void>;
}

export interface ColumnMeta {
  name: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
  hasDefault: boolean;
  generated: boolean;
  identity: boolean;
}

export interface FkRef {
  column: string;
  /** Unqualified parent table name. */
  parentTable: string;
  parentColumn: string;
}

export interface InsertHints {
  table: string;
  tag: string;
  email: string;
  mobile: string;
  label: string;
}

export type Assignment =
  | { column: string; kind: 'tenant' }
  | { column: string; kind: 'param'; value: string | number | boolean }
  | { column: string; kind: 'sql'; expr: string }
  | { column: string; kind: 'fk'; parentTable: string; parentColumn: string }
  | { column: string; kind: 'enum'; udtName: string };
